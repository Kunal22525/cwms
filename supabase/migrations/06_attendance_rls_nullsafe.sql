-- ============================================================
-- 06_attendance_rls_nullsafe.sql
-- Fix: supervisor / site incharge could not UPDATE an existing
-- attendance row whose site_id was NULL (either set at creation via
-- the "no site assigned" option, or orphaned to NULL by
-- attendance_site_id_fkey ON DELETE SET NULL from migration 01).
-- The attendance-page upsert then failed with:
--   "new row violates row-level security policy (USING expression)"
--
-- The page sends the SAME site_id (including NULL) on UPDATE, so both
-- the USING (old row) AND the WITH CHECK (new row) must accept NULL.
-- These policies relax that: a NULL-site row can be updated/kept as
-- NULL by the supervisor / site incharge, or re-attached to a site
-- they oversee. Setting or keeping any OTHER site remains blocked.
-- Reads stay strictly site-scoped (only admin sees NULL-site history).
-- ============================================================

DROP POLICY IF EXISTS "supervisor_update_site_attendance" ON public.attendance;
CREATE POLICY "supervisor_update_site_attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    NOT public.has_role('admin')
    AND (
      site_id IS NULL
      OR site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    NOT public.has_role('admin')
    AND (
      site_id IS NULL
      OR site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "site_incharge_update_site_attendance" ON public.attendance;
CREATE POLICY "site_incharge_update_site_attendance" ON public.attendance
  FOR UPDATE TO authenticated
  USING (
    public.is_site_incharge()
    AND (
      site_id IS NULL
      OR site_id IN (
        SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_site_incharge()
    AND (
      site_id IS NULL
      OR site_id IN (
        SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
      )
    )
  );