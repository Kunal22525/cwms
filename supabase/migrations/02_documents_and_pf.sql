-- ============================================================
-- CWMS CHANGE SET v3
-- Run this ENTIRE script once in Supabase SQL Editor
-- AFTER 00_setup_all.sql and 01_customer_changes.sql
--
-- Adds: worker PF percentage (for Excel salary sheet),
--       documents table + RLS + storage bucket for document uploads
--       with expiry tracking.
-- ============================================================


-- ============================================================
-- 1) WORKERS: PF (Provident Fund) percentage
--    12% is the standard employee contribution.
--    Set to 0 for workers who are not covered by PF.
-- ============================================================
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS pf_percentage numeric(5,2) NOT NULL DEFAULT 12;
ALTER TABLE public.workers ALTER COLUMN pf_percentage SET DEFAULT 12;

-- ============================================================
-- 2) DOCUMENTS
--    Company documents with a From date and an expiry date.
--    Uses the public storage bucket `documents` for file uploads.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  from_date date,
  expiry_date date NOT NULL,
  remind_me boolean NOT NULL DEFAULT true,
  reminder_days smallint NOT NULL DEFAULT 15 CHECK (reminder_days IN (5, 15, 30)),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read documents (company-wide)
DROP POLICY IF EXISTS "documents_read_all" ON public.documents;
CREATE POLICY "documents_read_all" ON public.documents
  FOR SELECT TO authenticated
  USING (true);

-- Admin manages documents
DROP POLICY IF EXISTS "admin_all_documents" ON public.documents;
CREATE POLICY "admin_all_documents" ON public.documents
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

CREATE INDEX IF NOT EXISTS idx_documents_expiry ON public.documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_documents_remind ON public.documents(remind_me);

-- ============================================================
-- 3) STORAGE: public bucket for documents
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  20971520, -- 20MB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documents_public_read" ON storage.objects;
CREATE POLICY "documents_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_upload" ON storage.objects;
CREATE POLICY "documents_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_update" ON storage.objects;
CREATE POLICY "documents_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_delete" ON storage.objects;
CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documents');