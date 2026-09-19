-- ============================================================
-- CWMS CHANGE SET v5: Salary Payments (On Site / In Office)
-- Run this ENTIRE script once in Supabase SQL Editor.
--
-- Records salary releases per worker per MONTH, so the salary
-- sheet can split "Salary Paid" into Paid on Site | Paid in Office.
-- Each release remembers WHICH month's salary it settles
-- (salary_month), so it counts in that month's sheet even if the
-- money was paid on a different calendar day.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT current_date,
  salary_month text NOT NULL DEFAULT to_char(current_date, 'YYYY-MM'),
  payment_location text NOT NULL DEFAULT 'On Site'
    CHECK (payment_location IN ('On Site', 'In Office')),
  remarks text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_payments_worker_date
  ON public.salary_payments (worker_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_salary_payments_worker_month
  ON public.salary_payments (worker_id, salary_month);
CREATE INDEX IF NOT EXISTS idx_salary_payments_location
  ON public.salary_payments (payment_location);

DROP TRIGGER IF EXISTS trg_salary_payments_updated_at ON public.salary_payments;
CREATE TRIGGER trg_salary_payments_updated_at
  BEFORE UPDATE ON public.salary_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.salary_payments ENABLE ROW LEVEL SECURITY;

-- Admin: full access
DROP POLICY IF EXISTS "admin_all_salary_payments" ON public.salary_payments;
CREATE POLICY "admin_all_salary_payments" ON public.salary_payments
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- Supervisor: read payments for workers in their site
DROP POLICY IF EXISTS "supervisor_read_site_payments" ON public.salary_payments;
CREATE POLICY "supervisor_read_site_payments" ON public.salary_payments
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

-- Supervisor: record payments for workers in their site
DROP POLICY IF EXISTS "supervisor_insert_site_payments" ON public.salary_payments;
CREATE POLICY "supervisor_insert_site_payments" ON public.salary_payments
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