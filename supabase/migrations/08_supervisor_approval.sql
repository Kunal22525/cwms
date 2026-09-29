-- ============================================================
-- CWMS CHANGE SET v7: Supervisor Self-Registration Approval
-- Run this ENTIRE script once in Supabase SQL Editor.
--
-- Security fix: a self-registered supervisor should NOT get a
-- working account / supervisor role immediately. Instead the
-- signup creates a Pending supervisor_requests row and the user
-- is granted the 'supervisor' role ONLY after an admin approves.
--
-- Changes:
--   1. New table supervisor_requests (Pending -> Approved/Rejected).
--   2. handle_new_user() is role-aware + invite-aware:
--        - site_incharge  (self-serve or admin invite): unchanged,
--          site_incharge role + Pending site_incharge_requests row.
--        - supervisor self-serve: NO role yet + Pending
--          supervisor_requests row.
--        - supervisor/admin invited via /api/users (metadata flag
--          admin_invite): role assigned directly (admin pre-approved).
--   3. RLS: admin full access; users can read only their own row.
--   4. list_supervisor_requests(): admin sees all, applicant sees own.
-- ============================================================

-- ============================================================
-- TABLE: supervisor_requests
-- Stores signup requests (Pending -> Approved/Rejected).
-- UNIQUE(user_id) = one request per user.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supervisor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_requests_status
  ON public.supervisor_requests (status);

DROP TRIGGER IF EXISTS trg_supervisor_requests_updated_at ON public.supervisor_requests;
CREATE TRIGGER trg_supervisor_requests_updated_at
  BEFORE UPDATE ON public.supervisor_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- FUNCTION: handle_new_user() — supervisor approval gating
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg_role text := NEW.raw_user_meta_data->>'registration_role';
  v_admin_invite boolean := COALESCE(
    (NEW.raw_user_meta_data->>'admin_invite')::boolean,
    false
  );
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_reg_role = 'site_incharge' THEN
    -- Site incharge signup (self-serve or admin invite): role assigned,
    -- access still gated until a site is assigned on approval.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'site_incharge')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.site_incharge_requests (user_id, requested_by)
    VALUES (NEW.id, NEW.id);
  ELSIF v_reg_role = 'supervisor' AND NOT v_admin_invite THEN
    -- Self-service supervisor registration: NO role until an admin
    -- approves via /api/supervisor-requests.
    INSERT INTO public.supervisor_requests (user_id, requested_by)
    VALUES (NEW.id, NEW.id);
  ELSE
    -- Admin invites (admin_invite = true) and legacy/default signups:
    -- role is assigned directly because the admin has pre-approved.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'supervisor')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- RLS: SUPERVISOR_REQUESTS
-- - Admin: full access.
-- - Any authenticated user: read only their own request row so
--   applicants can poll their status while pending.
-- - Supervisors (non-admin): NO visibility into other requests.
-- ============================================================
ALTER TABLE public.supervisor_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_supervisor_requests" ON public.supervisor_requests;
CREATE POLICY "admin_all_supervisor_requests" ON public.supervisor_requests
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "user_read_own_supervisor_request" ON public.supervisor_requests;
CREATE POLICY "user_read_own_supervisor_request" ON public.supervisor_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- FUNCTION: list_supervisor_requests() — SECURITY DEFINER
-- Admin: all requests. Applicant: only their own row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_supervisor_requests()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  email text,
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
  IF public.has_role('admin') THEN
    RETURN QUERY
      SELECT r.id, r.user_id, p.full_name, p.email, r.status,
             r.requested_by, r.decided_by, r.decided_at, r.created_at
      FROM public.supervisor_requests r
      LEFT JOIN public.profiles p ON p.id = r.user_id
      ORDER BY r.created_at DESC;
  ELSE
    RETURN QUERY
      SELECT r.id, r.user_id, p.full_name, p.email, r.status,
             r.requested_by, r.decided_by, r.decided_at, r.created_at
      FROM public.supervisor_requests r
      LEFT JOIN public.profiles p ON p.id = r.user_id
      WHERE r.user_id = auth.uid()
      ORDER BY r.created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_supervisor_requests() TO authenticated;