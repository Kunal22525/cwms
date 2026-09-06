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
