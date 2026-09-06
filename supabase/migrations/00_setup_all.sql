-- ============================================================
-- CWMS FULL DATABASE SETUP (all migrations combined)
-- Run this ENTIRE script once in Supabase SQL Editor
-- ============================================================


-- ============================================================
-- SOURCE: 20260821173139_001_initial_schema.sql.sql
-- ============================================================
/*
# Initial Schema â€” Construction Workforce Management System (CWMS)

## Purpose
Creates the core operational tables for the CWMS application: profiles, user_roles,
sites, workers, attendance, salary_advances, and report_logs.

## New Tables

1. **profiles**
   - id (uuid, PK, references auth.users, CASCADE on delete)
   - full_name (text, not null)
   - email (text, unique, not null)
   - mobile (text, nullable)
   - created_at, updated_at (timestamptz, default now())

2. **user_roles**
   - id (uuid, PK, default gen_random_uuid)
   - user_id (uuid, references auth.users, CASCADE on delete)
   - role (app_role enum: admin | supervisor, default 'supervisor')
   - created_at (timestamptz, default now())
   - UNIQUE(user_id, role)

3. **sites**
   - id (uuid, PK)
   - site_code (text, unique, not null) â€” auto-generated S001, S002...
   - site_name (text, not null)
   - address (text, nullable)
   - supervisor_id (uuid, references profiles)
   - status (text, default 'Active')
   - created_at, updated_at

4. **workers**
   - id (uuid, PK)
   - worker_code (text, unique, not null) â€” auto-generated W001, W002...
   - name, mobile, address, aadhaar, trade, daily_wage, joining_date, site_id
   - photo_url (text, nullable)
   - status (text, default 'Active')
   - working_place, work_type, working_since (for worker summary/history)
   - created_at, updated_at

5. **attendance**
   - id (uuid, PK)
   - worker_id (uuid, NOT NULL, references workers, CASCADE)
   - site_id (uuid, references sites)
   - attendance_date (date, not null)
   - attendance_time (timestamptz, default now())
   - shift (text: Day | Night, not null)
   - status (text: Present | Absent | Half Day | Leave, not null)
   - supervisor_id (uuid, references profiles)
   - created_at, updated_at
   - UNIQUE constraint on (worker_id, attendance_date, shift) to prevent duplicates

6. **salary_advances**
   - id (uuid, PK)
   - worker_id (uuid, NOT NULL, references workers, CASCADE)
   - amount (numeric(12,2), not null)
   - request_date (date, default current_date)
   - reason, remarks (text, nullable)
   - status (text: Pending | Approved | Rejected, default 'Pending')
   - requested_by, approved_by (uuid, references profiles)
   - approved_at (timestamptz, nullable)
   - created_at, updated_at

7. **report_logs**
   - id (uuid, PK)
   - report_type, file_name (text, nullable)
   - generated_by (uuid, references profiles)
   - generated_at (timestamptz, default now())

## Enums
- app_role: 'admin', 'supervisor'

## Notes
- All tables use UUID primary keys via gen_random_uuid().
- updated_at triggers are created in a separate migration.
- RLS policies are created in a separate migration.
- Site codes and worker codes are generated via database functions.
*/

-- ============================================================
-- ENUM: app_role
-- ============================================================
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'supervisor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  mobile text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: user_roles
-- ============================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'supervisor',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role)
);

-- ============================================================
-- TABLE: sites
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_code text UNIQUE NOT NULL,
  site_name text NOT NULL,
  address text,
  supervisor_id uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: workers
-- ============================================================
CREATE TABLE IF NOT EXISTS workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_code text UNIQUE NOT NULL,
  name text NOT NULL,
  mobile text,
  address text,
  aadhaar text,
  trade text,
  daily_wage numeric(12,2),
  joining_date date,
  site_id uuid REFERENCES sites(id),
  photo_url text,
  status text NOT NULL DEFAULT 'Active',
  working_place text,
  work_type text,
  working_since date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  site_id uuid REFERENCES sites(id),
  attendance_date date NOT NULL,
  attendance_time timestamptz DEFAULT now(),
  shift text NOT NULL,
  status text NOT NULL,
  supervisor_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Prevent duplicate attendance for same worker/date/shift
DO $$ BEGIN
  ALTER TABLE attendance
    ADD CONSTRAINT attendance_unique UNIQUE (worker_id, attendance_date, shift);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLE: salary_advances
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  remarks text,
  status text NOT NULL DEFAULT 'Pending',
  requested_by uuid REFERENCES profiles(id),
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- TABLE: report_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS report_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text,
  generated_by uuid REFERENCES profiles(id),
  generated_at timestamptz DEFAULT now(),
  file_name text
);



-- ============================================================
-- SOURCE: 20260821173200_002_auth_profiles.sql.sql
-- ============================================================
/*
# Auth Profiles Trigger & has_role() Security Function

## Purpose
1. Creates a SECURITY DEFINER function `has_role(p_role app_role)` that checks
   whether the current authenticated user has a given role. This is the ONLY
   authorized way to check roles â€” the frontend must never trust a role it
   supplies itself.
2. Creates a trigger on `auth.users` that automatically inserts a `profiles`
   row whenever a new user signs up, populating full_name and email from
   auth metadata.
3. Creates a trigger on `auth.users` that automatically assigns the
   'supervisor' role to new users. Admin can only be granted by updating
   user_roles directly (via SQL or admin UI).
4. Creates `updated_at` trigger functions and applies them to all tables
   with an `updated_at` column.

## Security
- `has_role()` is SECURITY DEFINER so it can read user_roles regardless of RLS.
- It uses `auth.uid()` to identify the caller â€” never trusts a passed user_id.
- New users default to 'supervisor'. No self-service admin elevation.
- The `handle_new_user` trigger runs as SECURITY DEFINER to insert into profiles
  and user_roles (which are RLS-locked).

## Notes
- `search_path` is set to `public` on all SECURITY DEFINER functions for security.
- Triggers are idempotent via `DROP TRIGGER IF EXISTS`.
*/

-- ============================================================
-- FUNCTION: has_role(p_role app_role) â€” SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(p_role app_role)
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
    WHERE user_id = v_user_id AND role = p_role
  ) INTO v_has;

  RETURN v_has;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.has_role(app_role) TO authenticated;

-- ============================================================
-- FUNCTION: handle_new_user() â€” auto-create profile + default role
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

  -- Insert default role: supervisor (never admin)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'supervisor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGER: on auth.users insert
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTION: update_updated_at() â€” auto-update updated_at column
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================
-- TRIGGERS: updated_at on all relevant tables
-- ============================================================
DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS sites_updated_at ON public.sites;
CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS workers_updated_at ON public.workers;
CREATE TRIGGER workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS attendance_updated_at ON public.attendance;
CREATE TRIGGER attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS salary_advances_updated_at ON public.salary_advances;
CREATE TRIGGER salary_advances_updated_at
  BEFORE UPDATE ON public.salary_advances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();



-- ============================================================
-- SOURCE: 20260821173234_003_roles_and_rls.sql.sql
-- ============================================================
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
  can update (but cannot approve/reject â€” that's admin only via a check).
- **report_logs**: Can read their own generated reports.

## Code Generation
- `generate_site_code()`: Returns next site code like S001, S002...
- `generate_worker_code()`: Returns next worker code like W001, W002...
- Both are SECURITY DEFINER so they can read existing codes regardless of RLS.

## Notes
- Policies use `auth.uid()` and `public.has_role()` â€” never `current_user`.
- No `USING (true)` shortcuts â€” every policy has a real ownership/membership check.
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
-- FUNCTION: generate_site_code() â€” SECURITY DEFINER
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
-- FUNCTION: generate_worker_code() â€” SECURITY DEFINER
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



-- ============================================================
-- SOURCE: 20260821173249_004_storage.sql.sql
-- ============================================================
/*
# Storage Bucket: worker-photos

## Purpose
Creates a private storage bucket `worker-photos` for uploading worker photos.

## Policies
- Authenticated users can upload, read, update, and delete photos.
- File types validated at the application layer: jpg, jpeg, png, webp.
- Max size 5MB enforced at the application layer.

## Notes
- The bucket is created via insert into storage.buckets.
- Storage policies are created on storage.objects.
*/

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worker-photos',
  'worker-photos',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES: worker-photos
-- ============================================================

-- Allow authenticated users to upload
DROP POLICY IF EXISTS "authenticated_upload_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_upload_worker_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'worker-photos');

-- Allow authenticated users to read
DROP POLICY IF EXISTS "authenticated_read_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_read_worker_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'worker-photos');

-- Allow authenticated users to update (replace)
DROP POLICY IF EXISTS "authenticated_update_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_update_worker_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'worker-photos')
  WITH CHECK (bucket_id = 'worker-photos');

-- Allow authenticated users to delete (remove)
DROP POLICY IF EXISTS "authenticated_delete_worker_photos" ON storage.objects;
CREATE POLICY "authenticated_delete_worker_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'worker-photos');



-- ============================================================
-- SOURCE: 20260821173300_005_indexes.sql.sql
-- ============================================================
/*
# Database Indexes

## Purpose
Creates indexes on frequently-queried columns for performance:
- workers: site_id, trade, status
- attendance: attendance_date, worker_id, site_id
- salary_advances: worker_id, status, request_date
- sites: supervisor_id, status

## Notes
- Uses IF NOT EXISTS for idempotency.
- These indexes support the dashboard, reports, and filtering queries.
*/

CREATE INDEX IF NOT EXISTS idx_workers_site_id ON public.workers(site_id);
CREATE INDEX IF NOT EXISTS idx_workers_trade ON public.workers(trade);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON public.attendance(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_site_id ON public.attendance(site_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_worker_id ON public.salary_advances(worker_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON public.salary_advances(status);
CREATE INDEX IF NOT EXISTS idx_salary_advances_request_date ON public.salary_advances(request_date);
CREATE INDEX IF NOT EXISTS idx_sites_supervisor_id ON public.sites(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_sites_status ON public.sites(status);

