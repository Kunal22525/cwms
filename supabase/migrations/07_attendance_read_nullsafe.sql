-- ============================================================
-- 07_attendance_read_nullsafe.sql
-- Companion to 06. PostgreSQL (10.1+ / CVE-2017-15099) requires that
-- INSERT ... ON CONFLICT DO UPDATE check the conflicting row AND the
-- proposed new row against the table's SELECT policies, and it throws
-- a hard error (not silent filtering) when they are not satisfied:
--   "new row violates row-level security policy (USING expression)"
--
-- The attendance page saves via exactly that upsert
-- (onConflict: worker_id,attendance_date,shift). With a row whose
-- site_id is NULL (site deleted -> FK SET NULL, or a worker with no
-- site), the supervisor / site incharge READ policies rejected the
-- row (site_id IN (...) does not match NULL), so every save touching
-- such a row failed even after migration 06 relaxed the UPDATE rules.
--
-- Relax only the SELECT USING to also admit NULL-site (orphaned)
-- rows, matching the UPDATE rules from 06: the supervisor / site
-- incharge may now see and edit attendance history whose site is
-- gone, or re-attach it to a site they oversee. Other sites remain
-- invisible. Admin access is unchanged (admin_all_attendance).
-- ============================================================

DROP POLICY IF EXISTS "supervisor_read_site_attendance" ON public.attendance;
CREATE POLICY "supervisor_read_site_attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    NOT public.has_role('admin')
    AND (
      site_id IS NULL
      OR site_id IN (
        SELECT id FROM public.sites WHERE supervisor_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "site_incharge_read_site_attendance" ON public.attendance;
CREATE POLICY "site_incharge_read_site_attendance" ON public.attendance
  FOR SELECT TO authenticated
  USING (
    public.is_site_incharge()
    AND (
      site_id IS NULL
      OR site_id IN (
        SELECT id FROM public.sites WHERE site_incharge_id = auth.uid()
      )
    )
  );