-- ============================================================
-- CWMS CHANGE SET v4: Worker Bank Details
-- Run this ENTIRE script once in Supabase SQL Editor.
--
-- Adds bank details to the workers master so the exported
-- salary sheet can include Bank Name, Account No., Branch, IFSC.
-- ============================================================

ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS ifsc text;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS branch text;