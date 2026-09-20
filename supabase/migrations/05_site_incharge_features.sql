-- ============================================================
-- CWMS CHANGE SET v6: Site Incharge Role
-- Run this ENTIRE script once in Supabase SQL Editor.
--
-- Adds a third role, 'site_incharge'. A site incharge:
--   1. Is NOT registered directly by an admin. They sign up by
--      selecting "Site Incharge" on the register page; the app
--      creates a Pending site_incharge_requests row.
--   2. Gets a role row ('site_incharge') at signup and can only
--      access the app once an admin/supervisor approves and
--      assigns them a site (sites.site_incharge_id).
--   3. Can take attendance for their assigned site's workers and
--      can REQUEST worker add/delete (no direct inserts/updates).
--   Retrieves attendance, workers, advances and their own pending
--   requests. Cannot manage users, roles, sites, releases.
--
-- NOTE on enums: ALTER TYPE ... ADD VALUE cannot be used in a
-- transaction that later CASTS to the new value. To keep this a
-- single runnable script we introduce is_site_incharge(), which
-- compares role::text, instead of calling has_role('site_incharge').
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'site_incharge';

-- ============================================================
-- COLUMN: sites.site_incharge_id
-- ============================================================
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS site_incharge_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- TABLE: site_incharge_requests
-- Stores signup requests (Pending -> Approved/Rejected) plus the
-- assigned site once decided. UNIQUE(user_id) = one request per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_incharge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_incharge_requests_status
  ON public.site_incharge_requests (status);
CREATE INDEX IF NOT EXISTS idx_site_incharge_requests_site
  ON public.site_incharge_requests (site_id);

DROP TRIGGER IF EXISTS trg_site_incharge_requests_updated_at ON public.site_incharge_requests;
CREATE TRIGGER trg_site_incharge_requests_updated_at
  BEFORE UPDATE ON public.site_incharge_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- TABLE: worker_change_requests
-- Site incharge requests to Add or Delete a worker on their site.
-- payload holds a JSON snapshot of the proposed worker for 'add'
-- and the existing worker for 'delete'. worker_id is SET NULL on
-- delete so history survives worker removal.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.worker_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('add', 'delete')),
  worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  payload jsonb,
  reason text,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_change_requests_site
  ON public.worker_change_requests (site_id);
CREATE INDEX IF NOT EXISTS idx_worker_change_requests_status
  ON public.worker_change_requests (status);

DROP TRIGGER IF EXISTS trg_worker_change_requests_updated_at ON public.worker_change_requests;
CREATE TRIGGER trg_worker_change_requests_updated_at
  BEFORE UPDATE ON public.worker_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- FUNCTION: is_site_incharge() — SECURITY DEFINER
-- Avoids casting the literal to app_role inside this same script
-- (see header comment about enum ADD VALUE transactions).
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_site_incharge()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_has boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id AND role::text = 'site_incharge'
  ) INTO v_has;

  RETURN v_has;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_site_incharge() TO authenticated;

-- ============================================================
-- FUNCTION: handle_new_user() — now role-aware
-- If the new user registered as a site incharge (raw_user_meta_data
-- registration_role), assign the site_incharge role and create a
-- Pending request. Otherwise default to supervisor as before.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.raw_user_meta_data->>'registration_role' = 'site_incharge' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'site_incharge')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.site_incharge_requests (user_id, requested_by)
    VALUES (NEW.id, NEW.id);
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'supervisor')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- RLS: SITES — site incharge reads only their assigned site
-- ============================================================
DROP POLICY IF EXISTS "site_incharge_read_assigned_site" ON public.sites;
CREATE POLICY "site_incharge_read_assigned_site" ON public.sites
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND site_incharge_id = auth.uid()
  );

-- ============================================================
-- RLS: WORKERS — site incharge reads (never writes) their site's workers
-- ============================================================
DROP POLICY IF EXISTS "site_incharge_read_site_workers" ON public.workers;
CREATE POLICY "site_incharge_read_site_workers" ON public.workers
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  );

-- ============================================================
-- RLS: ATTENDANCE — site incharge read/insert/update for their site
-- ============================================================
DROP POLICY IF EXISTS "site_incharge_read_site_attendance" ON public.attendance;
CREATE POLICY "site_incharge_read_site_attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "site_incharge_insert_site_attendance" ON public.attendance;
CREATE POLICY "site_incharge_insert_site_attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_incharge()
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "site_incharge_update_site_attendance" ON public.attendance;
CREATE POLICY "site_incharge_update_site_attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    public.is_site_incharge()
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_site_incharge()
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  );

-- ============================================================
-- RLS: SALARY_ADVANCES — site incharge read-only (view only)
-- ============================================================
DROP POLICY IF EXISTS "site_incharge_read_site_advances" ON public.salary_advances;
CREATE POLICY "site_incharge_read_site_advances" ON public.salary_advances
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND worker_id IN (
      SELECT w.id FROM public.workers w
      WHERE w.site_id IN (
        SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
      )
    )
  );

-- ============================================================
-- RLS: SITE_INCHARGE_REQUESTS
-- - Admin: full access.
-- - Supervisor: read (approve/reject happens via API / service role).
-- - Site incharge: read only their own request row.
-- ============================================================
ALTER TABLE public.site_incharge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_site_incharge_requests" ON public.site_incharge_requests;
CREATE POLICY "admin_all_site_incharge_requests" ON public.site_incharge_requests
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "supervisor_read_site_incharge_requests" ON public.site_incharge_requests;
CREATE POLICY "supervisor_read_site_incharge_requests" ON public.site_incharge_requests
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND public.has_role('supervisor')
  );

DROP POLICY IF EXISTS "site_incharge_read_own_request" ON public.site_incharge_requests;
CREATE POLICY "site_incharge_read_own_request" ON public.site_incharge_requests
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND user_id = auth.uid()
  );

-- ============================================================
-- RLS: WORKER_CHANGE_REQUESTS
-- - Admin: full access.
-- - Site incharge: insert for their assigned site; read their own.
-- - Supervisor: read requests for their site (approve via API).
-- ============================================================
ALTER TABLE public.worker_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_worker_change_requests" ON public.worker_change_requests;
CREATE POLICY "admin_all_worker_change_requests" ON public.worker_change_requests
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "site_incharge_insert_worker_request" ON public.worker_change_requests;
CREATE POLICY "site_incharge_insert_worker_request" ON public.worker_change_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_site_incharge()
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "site_incharge_read_own_worker_requests" ON public.worker_change_requests;
CREATE POLICY "site_incharge_read_own_worker_requests" ON public.worker_change_requests
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND requested_by = auth.uid()
  );

DROP POLICY IF EXISTS "supervisor_read_site_worker_requests" ON public.worker_change_requests;
CREATE POLICY "supervisor_read_site_worker_requests" ON public.worker_change_requests
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND public.has_role('supervisor')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- ============================================================
-- FUNCTION: list_site_incharge_requests() — SECURITY DEFINER
-- Joins profiles/sites (profiles RLS would otherwise hide data from
-- supervisors). Admin: all. Supervisor: all. Site incharge: own row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_site_incharge_requests()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  email text,
  site_id uuid,
  site_name text,
  status text,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin') OR public.has_role('supervisor') THEN
    RETURN QUERY
      SELECT r.id, r.user_id, p.full_name, p.email,
             r.site_id, s.site_name, r.status,
             r.requested_by, r.decided_by, r.decided_at, r.created_at
      FROM public.site_incharge_requests r
      LEFT JOIN public.profiles p ON p.id = r.user_id
      LEFT JOIN public.sites s ON s.id = r.site_id
      ORDER BY r.created_at DESC;
  ELSIF public.is_site_incharge() THEN
    RETURN QUERY
      SELECT r.id, r.user_id, p.full_name, p.email,
             r.site_id, s.site_name, r.status,
             r.requested_by, r.decided_by, r.decided_at, r.created_at
      FROM public.site_incharge_requests r
      LEFT JOIN public.profiles p ON p.id = r.user_id
      LEFT JOIN public.sites s ON s.id = r.site_id
      WHERE r.user_id = auth.uid();
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_site_incharge_requests() TO authenticated;

-- ============================================================
-- FUNCTION: list_worker_change_requests() — SECURITY DEFINER
-- Admin: all. Supervisor: requests for their site.
-- Site incharge: requests they submitted.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_worker_change_requests()
RETURNS TABLE (
  id uuid,
  request_type text,
  worker_id uuid,
  worker_name text,
  site_id uuid,
  site_name text,
  payload jsonb,
  reason text,
  status text,
  requested_by uuid,
  requester_name text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role('admin') THEN
    RETURN QUERY
      SELECT r.id, r.request_type, r.worker_id, w.name,
             r.site_id, s.site_name, r.payload, r.reason, r.status,
             r.requested_by, p.full_name, r.decided_by, r.decided_at, r.created_at
      FROM public.worker_change_requests r
      LEFT JOIN public.workers w ON w.id = r.worker_id
      LEFT JOIN public.sites s ON s.id = r.site_id
      LEFT JOIN public.profiles p ON p.id = r.requested_by
      ORDER BY r.created_at DESC;
  ELSIF public.has_role('supervisor') THEN
    RETURN QUERY
      SELECT r.id, r.request_type, r.worker_id, w.name,
             r.site_id, s.site_name, r.payload, r.reason, r.status,
             r.requested_by, p.full_name, r.decided_by, r.decided_at, r.created_at
      FROM public.worker_change_requests r
      LEFT JOIN public.workers w ON w.id = r.worker_id
      LEFT JOIN public.sites s ON s.id = r.site_id
      LEFT JOIN public.profiles p ON p.id = r.requested_by
      WHERE r.site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
      ORDER BY r.created_at DESC;
  ELSIF public.is_site_incharge() THEN
    RETURN QUERY
      SELECT r.id, r.request_type, r.worker_id, w.name,
             r.site_id, s.site_name, r.payload, r.reason, r.status,
             r.requested_by, p.full_name, r.decided_by, r.decided_at, r.created_at
      FROM public.worker_change_requests r
      LEFT JOIN public.workers w ON w.id = r.worker_id
      LEFT JOIN public.sites s ON s.id = r.site_id
      LEFT JOIN public.profiles p ON p.id = r.requested_by
      WHERE r.requested_by = auth.uid()
      ORDER BY r.created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_worker_change_requests() TO authenticated;