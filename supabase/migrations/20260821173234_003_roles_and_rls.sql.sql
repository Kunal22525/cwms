/*
# Row Level Security & Code Generation Functions

## Purpose
1. Enables RLS on all public tables.
2. Creates policies for Admin (full access to everything) and Supervisor
   (limited to assigned site, no deletes, no user management, no role changes).
3. Creates functions to auto-generate site_code (S001, S002...) and
   worker_code (W001, W002...).

## RLS Policy Design

### Admin
- Full CRUD on all tables: profiles, user_roles, sites, workers, attendance,
  salary_advances, report_logs.
- Uses `public.has_role('admin')` for authorization.

### Supervisor
- **profiles**: Can read their own profile only.
- **user_roles**: No access (cannot see or change roles).
- **sites**: Can read only the site they are assigned to as supervisor.
- **workers**: Can read workers in their assigned site; can insert/update
  workers in their site (but cannot delete).
- **attendance**: Can read and insert attendance for their site; can update
  but cannot delete.
- **salary_advances**: Can read and insert advances for workers in their site;
  can update (but cannot approve/reject — that's admin only via a check).
- **report_logs**: Can read their own generated reports.

## Code Generation
- `generate_site_code()`: Returns next site code like S001, S002...
- `generate_worker_code()`: Returns next worker code like W001, W002...
- Both are SECURITY DEFINER so they can read existing codes regardless of RLS.

## Notes
- Policies use `auth.uid()` and `public.has_role()` — never `current_user`.
- No `USING (true)` shortcuts — every policy has a real ownership/membership check.
- Supervisor cannot delete any records (no DELETE policies for supervisor).
*/

-- ============================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_profiles" ON public.profiles;
CREATE POLICY "admin_all_profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read own profile, update own profile
DROP POLICY IF EXISTS "supervisor_read_own_profile" ON public.profiles;
CREATE POLICY "supervisor_read_own_profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "supervisor_update_own_profile" ON public.profiles;
CREATE POLICY "supervisor_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- USER_ROLES POLICIES (admin only)
-- ============================================================

DROP POLICY IF EXISTS "admin_all_user_roles" ON public.user_roles;
CREATE POLICY "admin_all_user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- ============================================================
-- SITES POLICIES
-- ============================================================

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_sites" ON public.sites;
CREATE POLICY "admin_all_sites" ON public.sites
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read only their assigned site
DROP POLICY IF EXISTS "supervisor_read_assigned_site" ON public.sites;
CREATE POLICY "supervisor_read_assigned_site" ON public.sites
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND supervisor_id = auth.uid()
  );

-- ============================================================
-- WORKERS POLICIES
-- ============================================================

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_workers" ON public.workers;
CREATE POLICY "admin_all_workers" ON public.workers
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read workers in their assigned site
DROP POLICY IF EXISTS "supervisor_read_site_workers" ON public.workers;
CREATE POLICY "supervisor_read_site_workers" ON public.workers
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- Supervisor: insert workers in their assigned site
DROP POLICY IF EXISTS "supervisor_insert_site_workers" ON public.workers;
CREATE POLICY "supervisor_insert_site_workers" ON public.workers
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- Supervisor: update workers in their assigned site (no delete)
DROP POLICY IF EXISTS "supervisor_update_site_workers" ON public.workers;
CREATE POLICY "supervisor_update_site_workers" ON public.workers
  FOR UPDATE TO authenticated
  USING (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- ============================================================
-- ATTENDANCE POLICIES
-- ============================================================

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_attendance" ON public.attendance;
CREATE POLICY "admin_all_attendance" ON public.attendance
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read attendance for their site
DROP POLICY IF EXISTS "supervisor_read_site_attendance" ON public.attendance;
CREATE POLICY "supervisor_read_site_attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- Supervisor: insert attendance for their site
DROP POLICY IF EXISTS "supervisor_insert_site_attendance" ON public.attendance;
CREATE POLICY "supervisor_insert_site_attendance" ON public.attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- Supervisor: update attendance for their site (no delete)
DROP POLICY IF EXISTS "supervisor_update_site_attendance" ON public.attendance;
CREATE POLICY "supervisor_update_site_attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  )
  WITH CHECK (
    NOT public.has_role('admin')
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
    )
  );

-- ============================================================
-- SALARY_ADVANCES POLICIES
-- ============================================================

-- Admin: full access (including approve/reject)
DROP POLICY IF EXISTS "admin_all_salary_advances" ON public.salary_advances;
CREATE POLICY "admin_all_salary_advances" ON public.salary_advances
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read advances for workers in their site
DROP POLICY IF EXISTS "supervisor_read_site_advances" ON public.salary_advances;
CREATE POLICY "supervisor_read_site_advances" ON public.salary_advances
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND worker_id IN (
      SELECT w.id FROM public.workers w
      WHERE w.site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
  );

-- Supervisor: insert advance requests for workers in their site
DROP POLICY IF EXISTS "supervisor_insert_site_advances" ON public.salary_advances;
CREATE POLICY "supervisor_insert_site_advances" ON public.salary_advances
  FOR INSERT TO authenticated
  WITH CHECK (
    NOT public.has_role('admin')
    AND worker_id IN (
      SELECT w.id FROM public.workers w
      WHERE w.site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
  );

-- Supervisor: update advances (but cannot change status to Approved/Rejected)
DROP POLICY IF EXISTS "supervisor_update_site_advances" ON public.salary_advances;
CREATE POLICY "supervisor_update_site_advances" ON public.salary_advances
  FOR UPDATE TO authenticated
  USING (
    NOT public.has_role('admin')
    AND worker_id IN (
      SELECT w.id FROM public.workers w
      WHERE w.site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    NOT public.has_role('admin')
    AND worker_id IN (
      SELECT w.id FROM public.workers w
      WHERE w.site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
    AND status = 'Pending'
  );

-- ============================================================
-- REPORT_LOGS POLICIES
-- ============================================================

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_report_logs" ON public.report_logs;
CREATE POLICY "admin_all_report_logs" ON public.report_logs
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read own generated reports, insert own reports
DROP POLICY IF EXISTS "supervisor_read_own_report_logs" ON public.report_logs;
CREATE POLICY "supervisor_read_own_report_logs" ON public.report_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = generated_by);

DROP POLICY IF EXISTS "supervisor_insert_own_report_logs" ON public.report_logs;
CREATE POLICY "supervisor_insert_own_report_logs" ON public.report_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = generated_by);

-- ============================================================
-- FUNCTION: generate_site_code() — SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_site_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_code text;
  next_num integer;
  new_code text;
BEGIN
  SELECT site_code INTO max_code
  FROM public.sites
  ORDER BY site_code DESC
  LIMIT 1;

  IF max_code IS NULL THEN
    next_num := 1;
  ELSE
    next_num := CAST(REPLACE(max_code, 'S', '') AS integer) + 1;
  END IF;

  new_code := 'S' || lpad(next_num::text, 3, '0');
  RETURN new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_site_code() TO authenticated;

-- ============================================================
-- FUNCTION: generate_worker_code() — SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_worker_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_code text;
  next_num integer;
  new_code text;
BEGIN
  SELECT worker_code INTO max_code
  FROM public.workers
  ORDER BY worker_code DESC
  LIMIT 1;

  IF max_code IS NULL THEN
    next_num := 1;
  ELSE
    next_num := CAST(REPLACE(max_code, 'W', '') AS integer) + 1;
  END IF;

  new_code := 'W' || lpad(next_num::text, 3, '0');
  RETURN new_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_worker_code() TO authenticated;
