export type AppRole = 'admin' | 'supervisor';

export type SiteStatus = 'Active' | 'Inactive';

export type WorkerStatus = 'Active' | 'Inactive';

export type AttendanceShift = 'Day' | 'Night';

export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'Leave';

export type AdvanceStatus = 'Pending' | 'Approved' | 'Rejected';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Site {
  id: string;
  site_code: string;
  site_name: string;
  address: string | null;
  supervisor_id: string | null;
  status: SiteStatus;
  created_at: string;
  updated_at: string;
  supervisor?: Profile | null;
  worker_count?: number;
}

export interface Worker {
  id: string;
  worker_code: string;
  name: string;
  mobile: string | null;
  address: string | null;
  aadhaar: string | null;
  trade: string | null;
  daily_wage: number | null;
  joining_date: string | null;
  site_id: string | null;
  photo_url: string | null;
  status: WorkerStatus;
  working_place: string | null;
  work_type: string | null;
  working_since: string | null;
  created_at: string;
  updated_at: string;
  site?: Site | null;
}

export interface Attendance {
  id: string;
  worker_id: string;
  site_id: string | null;
  attendance_date: string;
  attendance_time: string;
  shift: AttendanceShift;
  status: AttendanceStatus;
  supervisor_id: string | null;
  created_at: string;
  updated_at: string;
  worker?: Pick<Worker, 'id' | 'worker_code' | 'name' | 'trade'>;
  site?: Pick<Site, 'id' | 'site_name'> | null;
  supervisor?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface SalaryAdvance {
  id: string;
  worker_id: string;
  amount: number;
  request_date: string;
  reason: string | null;
  remarks: string | null;
  status: AdvanceStatus;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  worker?: Pick<Worker, 'id' | 'worker_code' | 'name' | 'trade'>;
  requested_by_profile?: Pick<Profile, 'id' | 'full_name'> | null;
  approved_by_profile?: Pick<Profile, 'id' | 'full_name'> | null;
}

export interface ReportLog {
  id: string;
  report_type: string | null;
  generated_by: string | null;
  generated_at: string;
  file_name: string | null;
}

export interface UserWithRole extends Profile {
  role: AppRole;
}
