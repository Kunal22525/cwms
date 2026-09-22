-- ============================================================
-- 06_attendance_rls_nullsafe.sql
-- Fix: supervisor / site incharge could not UPDATE an existing
-- attendance row whose site_id was set to NULL after its site was
-- deleted (attendance_site_id_fkey ON DELETE SET NULL from
-- migration 01). The upsert in the attendance page then failed with
-- "new row violates row-level security policy (USING expression)".
--
-- Relax only the UPDATE `USING` clause so rows with a NULL site_id
-- (orphaned history from a deleted site) can be (re)taken by the
-- supervisor / site incharge, while `WITH CHECK` still forces the
-- new site_id to belong to them. Reads remain strictly site-scoped.
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
    AND site_id IN (
      SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
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
    AND site_id IN (
      SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
    )
  );