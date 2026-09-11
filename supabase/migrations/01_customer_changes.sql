-- ============================================================
-- CWMS CHANGE SET v2 (customer requested changes)
-- Run this ENTIRE script once in Supabase SQL Editor
-- AFTER 00_setup_all.sql
--
-- Adds: site GST/client/phone2/working period, manual site code,
-- worker temporary flag + delete, attendance overtime/deduction/
-- paid-unpaid leave, company settings (logo + name), company logo
-- storage bucket.
-- ============================================================


-- ============================================================
-- 1) SITES: customer fields
--    (GST no., client name, 2nd contact number, working period)
-- ============================================================
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS gst_number text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS contact_number_2 text;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS working_from date;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS working_to date;


-- ============================================================
-- 2) WORKERS: temporary-worker flag
--    (temp workers appear in the last section of the Excel sheet)
-- ============================================================
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false;


-- ============================================================
-- 3) ATTENDANCE: overtime, deduction and paid/unpaid leave
-- ============================================================
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS overtime numeric(4,1) NOT NULL DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS deduction numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS leave_type text;

DO $$ BEGIN
  ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_leave_type_check
    CHECK (leave_type IS NULL OR leave_type IN ('Paid', 'Unpaid'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 4) Allow deleting sites: unassign workers/attendance/supervisor
--    Instead of blocking on foreign keys, set them to NULL.
-- ============================================================
ALTER TABLE public.workers DROP CONSTRAINT IF EXISTS workers_site_id_fkey;
ALTER TABLE public.workers
  ADD CONSTRAINT workers_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;

ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_site_id_fkey;
ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_site_id_fkey
  FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;

ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_supervisor_id_fkey;
ALTER TABLE public.sites
  ADD CONSTRAINT sites_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ============================================================
-- 5) COMPANY SETTINGS (company logo + name shown in app & Excel)
--    Stores a single row.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  company_name text NOT NULL DEFAULT 'Construction Workforce Manager',
  tagline text NOT NULL DEFAULT 'Workforce Management System',
  logo_url text,
  phone text,
  email text,
  address text,
  gst_number text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.company_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS company_settings_updated_at ON public.company_settings;
CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Everyone (authenticated) can read company settings
DROP POLICY IF EXISTS "company_settings_read" ON public.company_settings;
CREATE POLICY "company_settings_read" ON public.company_settings
  FOR SELECT TO authenticated
  USING (true);

-- Admin can update company settings
DROP POLICY IF EXISTS "admin_update_company_settings" ON public.company_settings;
CREATE POLICY "admin_update_company_settings" ON public.company_settings
  FOR UPDATE TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));


-- ============================================================
-- 6) STORAGE: public bucket for company logo
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company_assets_public_read" ON storage.objects;
CREATE POLICY "company_assets_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "company_assets_upload" ON storage.objects;
CREATE POLICY "company_assets_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "company_assets_update" ON storage.objects;
CREATE POLICY "company_assets_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets')
  WITH CHECK (bucket_id = 'company-assets');

DROP POLICY IF EXISTS "company_assets_delete" ON storage.objects;
CREATE POLICY "company_assets_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets');


-- ============================================================
-- 7) Index on temporary workers
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_workers_is_temporary ON public.workers(is_temporary);