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
  gst_number: string | null;
  client_name: string | null;
  contact_number_2: string | null;
  working_from: string | null;
  working_to: string | null;
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
  is_temporary: boolean;
  pf_percentage: number | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
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
  overtime: number;
  deduction: number;
  leave_type: 'Paid' | 'Unpaid' | null;
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

export interface CompanySettings {
  id: boolean;
  company_name: string;
  tagline: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  updated_at: string;
}

export type DocumentExpiryStatus =
  | 'valid'
  | 'expiring_soon'
  | 'expired';

export interface Document {
  id: string;
  title: string;
  description: string | null;
  file_name: string | null;
  storage_path: string;
  file_url: string;
  file_type: string | null;
  file_size_bytes: number;
  from_date: string | null;
  expiry_date: string;
  remind_me: boolean;
  reminder_days: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  uploaded_by_profile?: Pick<Profile, 'id' | 'full_name'> | null;
}
