import type {
  Attendance,
  CompanySettings,
  Document,
  Profile,
  ReportLog,
  SalaryAdvance,
  SalaryPayment,
  Site,
  SiteInchargeRequest,
  UserRole,
  Worker,
  WorkerChangeRequest,
} from '@/types';

export const DEMO_USER_ID = 'demo-user';
export const DEMO_USER_EMAIL = 'demo@cwms.demo';
export const DEMO_USER_NAME = 'Demo Admin';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function localTodayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return localTodayStr(d);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function currentMonthPrefix(): string {
  return localTodayStr().slice(0, 7);
}

export interface DemoDb {
  seq: { workerCode: number; request: number };
  profiles: Profile[];
  user_roles: UserRole[];
  sites: Site[];
  workers: Worker[];
  attendance: Attendance[];
  salary_advances: SalaryAdvance[];
  salary_payments: SalaryPayment[];
  documents: Document[];
  company_settings: CompanySettings[];
  site_incharge_requests: SiteInchargeRequest[];
  worker_change_requests: WorkerChangeRequest[];
  report_logs: ReportLog[];
}

interface Seed {
  seq: DemoDb['seq'];
  profiles: Array<Profile & { role: 'admin' | 'supervisor' | 'site_incharge' }>;
  sites: Site[];
  workers: Worker[];
  attendance: Attendance[];
  salary_advances: SalaryAdvance[];
  salary_payments: SalaryPayment[];
  documents: Document[];
  site_incharge_requests: SiteInchargeRequest[];
  worker_change_requests: WorkerChangeRequest[];
  company_settings: CompanySettings;
}

function seed(): Seed {
  const now = new Date().toISOString();
  const ms = now.slice(0, 23) + 'Z';

  const baseProfiles = [
    { id: DEMO_USER_ID, full_name: DEMO_USER_NAME, email: DEMO_USER_EMAIL, mobile: '9800000000', created_at: toDateStr(-200), updated_at: toDateStr(-200), role: 'admin' as const },
    { id: 'demo-prof-sup1', full_name: 'Rahul Verma', email: 'rahul.demo@example.com', mobile: '9811111111', created_at: toDateStr(-180), updated_at: toDateStr(-180), role: 'supervisor' as const },
    { id: 'demo-prof-sup2', full_name: 'Amit Oraon', email: 'amit.demo@example.com', mobile: '9822222222', created_at: toDateStr(-170), updated_at: toDateStr(-170), role: 'supervisor' as const },
    { id: 'demo-prof-inc1', full_name: 'Suresh Mahto', email: 'suresh.demo@example.com', mobile: '9833333333', created_at: toDateStr(-150), updated_at: toDateStr(-150), role: 'site_incharge' as const },
    { id: 'demo-prof-inc2', full_name: 'Poonam Lakra', email: 'poonam.demo@example.com', mobile: '9844444444', created_at: toDateStr(-140), updated_at: toDateStr(-140), role: 'site_incharge' as const },
    { id: 'demo-prof-inc3', full_name: 'Krishna Bhagat', email: 'krishna.demo@example.com', mobile: '9855555555', created_at: toDateStr(-120), updated_at: toDateStr(-120), role: 'site_incharge' as const },
    { id: 'demo-prof-inc4', full_name: 'Anjali Tigga', email: 'anjali.demo@example.com', mobile: '9866666666', created_at: toDateStr(-110), updated_at: toDateStr(-110), role: 'site_incharge' as const },
    { id: 'demo-prof-inc5', full_name: 'Deepak Kumar', email: 'deepak.demo@example.com', mobile: '9877777777', created_at: toDateStr(-100), updated_at: toDateStr(-100), role: 'site_incharge' as const },
  ] as const;

  const profiles = baseProfiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    mobile: p.mobile,
    created_at: p.created_at,
    updated_at: p.updated_at,
    role: p.role,
  })) as ReturnType<typeof seed>['profiles'];

  const sites: Site[] = [
    {
      id: 'demo-site-1', site_code: 'S-001', site_name: 'Skyline Tower, Bahadurpur', address: 'Bahadurpur, Ranchi',
      gst_number: '20DEMO001', client_name: 'Skyline Developers', contact_number_2: '0651-2200001',
      working_from: '08:00', working_to: '18:00', supervisor_id: 'demo-prof-sup1', site_incharge_id: 'demo-prof-inc1',
      status: 'Active', created_at: toDateStr(-180), updated_at: toDateStr(-5),
    },
    {
      id: 'demo-site-2', site_code: 'S-002', site_name: 'Riverside Residency, Ranchi', address: 'Kutchery Road, Ranchi',
      gst_number: '20DEMO002', client_name: 'Riverside Builders', contact_number_2: '0651-2200002',
      working_from: '09:00', working_to: '19:00', supervisor_id: 'demo-prof-sup2', site_incharge_id: 'demo-prof-inc2',
      status: 'Active', created_at: toDateStr(-170), updated_at: toDateStr(-3),
    },
    {
      id: 'demo-site-3', site_code: 'S-003', site_name: 'Highway Bridge Works, NH-33', address: 'NH-33, Khunti Road',
      gst_number: '20DEMO003', client_name: 'NHAI', contact_number_2: null,
      working_from: '07:00', working_to: '17:00', supervisor_id: 'demo-prof-sup1', site_incharge_id: null,
      status: 'Active', created_at: toDateStr(-160), updated_at: toDateStr(-1),
    },
  ];

  const workers: Worker[] = [
    { id: 'demo-w-1', worker_code: 'W001', name: 'Ravi Kumar', mobile: '9000000001', address: 'Bahadurpur', aadhaar: '111122223333', trade: 'Mason', daily_wage: 500, joining_date: '2023-04-12', site_id: 'demo-site-1', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'SBI', account_number: '123456789012', ifsc: 'SBIN0001234', branch: 'Bahadurpur', status: 'Active', working_place: 'Tower A', work_type: 'Civil', working_since: '2023-04-12', created_at: toDateStr(-180), updated_at: toDateStr(-5) },
    { id: 'demo-w-2', worker_code: 'W002', name: 'Sunita Devi', mobile: '9000000002', address: 'Kanke', aadhaar: '444455556666', trade: 'Helper', daily_wage: 350, joining_date: '2023-06-01', site_id: 'demo-site-1', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'HDFC Bank', account_number: '987654321098', ifsc: 'HDFC0004567', branch: 'Ranchi', status: 'Active', working_place: 'Tower A', work_type: 'Civil', working_since: '2023-06-01', created_at: toDateStr(-180), updated_at: toDateStr(-5) },
    { id: 'demo-w-3', worker_code: 'W003', name: 'Mohan Prasad', mobile: '9000000003', address: 'Harmu', aadhaar: '777788889999', trade: 'Carpenter', daily_wage: 550, joining_date: '2022-11-20', site_id: 'demo-site-1', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'PNB', account_number: '456789123456', ifsc: 'PUNB0007890', branch: 'Kanke', status: 'Active', working_place: 'Site Office', work_type: 'Civil', working_since: '2022-11-20', created_at: toDateStr(-185), updated_at: toDateStr(-5) },
    { id: 'demo-w-4', worker_code: 'W004', name: 'Anita Kumari', mobile: '9000000004', address: 'Kutchery', aadhaar: '222233334444', trade: 'Steel Binder', daily_wage: 400, joining_date: '2024-01-15', site_id: 'demo-site-1', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: '', account_number: '', ifsc: '', branch: '', status: 'Active', working_place: 'Tower B', work_type: 'Civil', working_since: '2024-01-15', created_at: toDateStr(-150), updated_at: toDateStr(-5) },
    { id: 'demo-w-5', worker_code: 'W005', name: 'Devendra Sahu', mobile: '9000000005', address: 'Doranda', aadhaar: null, trade: 'Painter', daily_wage: 450, joining_date: '2025-08-02', site_id: 'demo-site-1', photo_url: null, is_temporary: true, pf_percentage: 0, bank_name: 'SBI', account_number: '321654987012', ifsc: 'SBIN0004321', branch: 'Bahadurpur', status: 'Active', working_place: 'Tower B', work_type: 'Finishing', working_since: '2025-08-02', created_at: toDateStr(-60), updated_at: toDateStr(-5) },
    { id: 'demo-w-6', worker_code: 'W006', name: 'Pooja Mahato', mobile: '9000000006', address: 'Kutchery Road', aadhaar: '555566667777', trade: 'Electrician', daily_wage: 600, joining_date: '2023-02-28', site_id: 'demo-site-2', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'ICICI Bank', account_number: '654789321012', ifsc: 'ICIC0001122', branch: 'Ranchi', status: 'Active', working_place: 'Block 1', work_type: 'MEP', working_since: '2023-02-28', created_at: toDateStr(-180), updated_at: toDateStr(-3) },
    { id: 'demo-w-7', worker_code: 'W007', name: 'Vikas Yadav', mobile: '9000000007', address: 'Dhanbad', aadhaar: '888899991111', trade: 'Mason', daily_wage: 520, joining_date: '2022-09-10', site_id: 'demo-site-2', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'SBI', account_number: '789123456098', ifsc: 'SBIN0009876', branch: 'Dhanbad', status: 'Active', working_place: 'Block 2', work_type: 'Civil', working_since: '2022-09-10', created_at: toDateStr(-190), updated_at: toDateStr(-3) },
    { id: 'demo-w-8', worker_code: 'W008', name: 'Kiran Bala', mobile: '9000000008', address: 'Kanke Road', aadhaar: '333344445555', trade: 'Helper', daily_wage: 330, joining_date: '2024-05-22', site_id: 'demo-site-2', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: '', account_number: '', ifsc: '', branch: '', status: 'Active', working_place: 'Block 1', work_type: 'Civil', working_since: '2024-05-22', created_at: toDateStr(-140), updated_at: toDateStr(-3) },
    { id: 'demo-w-9', worker_code: 'W009', name: 'Sanjay Singh', mobile: '9000000009', address: 'Ranchi', aadhaar: '666677778888', trade: 'Plumber', daily_wage: 480, joining_date: '2023-10-05', site_id: 'demo-site-2', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'Axis Bank', account_number: '147258369012', ifsc: 'UTIB0003344', branch: 'Ranchi', status: 'Active', working_place: 'Block 2', work_type: 'MEP', working_since: '2023-10-05', created_at: toDateStr(-160), updated_at: toDateStr(-3) },
    { id: 'demo-w-10', worker_code: 'W010', name: 'Meena Bara', mobile: '9000000010', address: 'Torpa', aadhaar: null, trade: 'Painter', daily_wage: 420, joining_date: '2025-07-14', site_id: 'demo-site-3', photo_url: null, is_temporary: true, pf_percentage: 0, bank_name: 'SBI', account_number: '963852741012', ifsc: 'SBIN0005566', branch: 'Torpa', status: 'Active', working_place: 'Bridge East', work_type: 'Finishing', working_since: '2025-07-14', created_at: toDateStr(-70), updated_at: toDateStr(-1) },
    { id: 'demo-w-11', worker_code: 'W011', name: 'Arun Lakra', mobile: '9000000011', address: 'Simdega', aadhaar: '999900001111', trade: 'Carpenter', daily_wage: 560, joining_date: '2023-03-19', site_id: 'demo-site-3', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: 'SBI', account_number: '852963741098', ifsc: 'SBIN0007788', branch: 'Simdega', status: 'Active', working_place: 'Bridge West', work_type: 'Structural', working_since: '2023-03-19', created_at: toDateStr(-170), updated_at: toDateStr(-1) },
    { id: 'demo-w-12', worker_code: 'W012', name: 'Rekha Oraon', mobile: '9000000012', address: 'Gumla', aadhaar: '444433332222', trade: 'Steel Binder', daily_wage: 380, joining_date: '2022-12-08', site_id: 'demo-site-3', photo_url: null, is_temporary: false, pf_percentage: 12, bank_name: '', account_number: '', ifsc: '', branch: '', status: 'Inactive', working_place: null, work_type: 'Structural', working_since: null, created_at: toDateStr(-185), updated_at: toDateStr(-40) },
    { id: 'demo-w-13', worker_code: 'W013', name: 'Nitin Ekka', mobile: '9000000013', address: 'Khunti', aadhaar: null, trade: 'Helper', daily_wage: 340, joining_date: '2025-09-01', site_id: 'demo-site-3', photo_url: null, is_temporary: true, pf_percentage: 0, bank_name: 'SBI', account_number: '741852963012', ifsc: 'SBIN0009900', branch: 'Gumla', status: 'Active', working_place: 'Bridge East', work_type: 'Structural', working_since: '2025-09-01', created_at: toDateStr(-30), updated_at: toDateStr(-1) },
  ];

  // Current month attendance (deterministic, up to today).
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const totalDays = daysInMonth(year, month);
  const rand = mulberry32(42);
  const shifts: Array<'Day' | 'Night'> = ['Day', 'Day', 'Night'];
  const attendance: Attendance[] = [];
  const todayStr = localTodayStr();
  workers.forEach((w, wi) => {
    if (w.status === 'Inactive') return;
    const restDays = new Set<number>();
    for (let i = 0; i < 4; i++) restDays.add(4 + Math.floor(rand() * (totalDays - 8)));
    for (let d = 1; d <= totalDays; d++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (date > todayStr) break;
      let status: Attendance['status'] = 'Present';
      let overtime = 0;
      let deduction = 0;
      let leave_type: 'Paid' | 'Unpaid' | null = null;
      if (restDays.has(d)) {
        status = 'Absent';
      } else {
        const r = rand();
        if (r > 0.93) {
          status = 'Leave';
          leave_type = r > 0.97 ? 'Paid' : 'Unpaid';
        } else if (r > 0.87) {
          status = 'Half Day';
        }
      }
      if (status === 'Present') {
        if (rand() > 0.72) overtime = Math.round(rand() * 16) / 2;
        if (rand() > 0.96) deduction = 50;
      }
      const shift = shifts[(d + wi) % shifts.length];
      attendance.push({
        id: `demo-att-${wi}-${d}`,
        worker_id: w.id,
        site_id: w.site_id,
        attendance_date: date,
        attendance_time: `${date}T09:00:00+05:30`,
        shift,
        status,
        overtime,
        deduction,
        leave_type,
        supervisor_id: w.site_id === 'demo-site-3' ? 'demo-prof-sup1' : 'demo-prof-sup2',
        created_at: ms,
        updated_at: ms,
      });
    }
  });

  const salary_advances: SalaryAdvance[] = [
    { id: 'demo-adv-1', worker_id: 'demo-w-1', amount: 2000, request_date: toDateStr(-5), reason: 'Home construction work', remarks: null, status: 'Approved', requested_by: 'demo-prof-inc1', approved_by: DEMO_USER_ID, approved_at: toDateStr(-4), created_at: toDateStr(-5), updated_at: toDateStr(-4) },
    { id: 'demo-adv-2', worker_id: 'demo-w-3', amount: 1500, request_date: toDateStr(-3), reason: 'Medical emergency', remarks: null, status: 'Pending', requested_by: 'demo-prof-inc1', approved_by: null, approved_at: null, created_at: toDateStr(-3), updated_at: toDateStr(-3) },
    { id: 'demo-adv-3', worker_id: 'demo-w-6', amount: 3000, request_date: toDateStr(-12), reason: 'School fees', remarks: null, status: 'Approved', requested_by: 'demo-prof-inc2', approved_by: DEMO_USER_ID, approved_at: toDateStr(-10), created_at: toDateStr(-12), updated_at: toDateStr(-10) },
    { id: 'demo-adv-4', worker_id: 'demo-w-7', amount: 1000, request_date: toDateStr(-8), reason: 'Festival advance', remarks: null, status: 'Approved', requested_by: 'demo-prof-inc2', approved_by: DEMO_USER_ID, approved_at: toDateStr(-7), created_at: toDateStr(-8), updated_at: toDateStr(-7) },
    { id: 'demo-adv-5', worker_id: 'demo-w-2', amount: 800, request_date: toDateStr(-1), reason: 'Grocery', remarks: null, status: 'Pending', requested_by: 'demo-prof-inc1', approved_by: null, approved_at: null, created_at: toDateStr(-1), updated_at: toDateStr(-1) },
    { id: 'demo-adv-6', worker_id: 'demo-w-11', amount: 500, request_date: toDateStr(-2), reason: 'Travel', remarks: null, status: 'Rejected', requested_by: 'demo-prof-sup1', approved_by: DEMO_USER_ID, approved_at: toDateStr(-2), created_at: toDateStr(-2), updated_at: toDateStr(-2) },
  ];

  const pm = currentMonthPrefix();
  const salary_payments: SalaryPayment[] = [
    { id: 'demo-pay-1', worker_id: 'demo-w-1', site_id: 'demo-site-1', amount: 5000, payment_date: toDateStr(-16), salary_month: pm, payment_location: 'On Site', remarks: 'Salary advance paid on site', created_by: DEMO_USER_ID, created_at: toDateStr(-16), updated_at: toDateStr(-16) },
    { id: 'demo-pay-2', worker_id: 'demo-w-6', site_id: 'demo-site-2', amount: 3000, payment_date: toDateStr(-16), salary_month: pm, payment_location: 'In Office', remarks: null, created_by: DEMO_USER_ID, created_at: toDateStr(-16), updated_at: toDateStr(-16) },
    { id: 'demo-pay-3', worker_id: 'demo-w-7', site_id: 'demo-site-2', amount: 2500, payment_date: toDateStr(-16), salary_month: pm, payment_location: 'On Site', remarks: null, created_by: DEMO_USER_ID, created_at: toDateStr(-16), updated_at: toDateStr(-16) },
  ];

  const documents: Document[] = [
    { id: 'demo-doc-1', title: 'Site Safety Policy', description: 'Approved safety manual for all sites', file_name: 'safety-policy.pdf', storage_path: 'documents/demo-doc-1-safety-policy.pdf', file_url: '', file_type: 'application/pdf', file_size_bytes: 284000, from_date: toDateStr(-90), expiry_date: toDateStr(-40), remind_me: true, reminder_days: 30, uploaded_by: DEMO_USER_ID, created_at: toDateStr(-45), updated_at: toDateStr(-45) },
    { id: 'demo-doc-2', title: 'Liability Insurance', description: 'Annual contractor insurance policy', file_name: 'insurance.xlsx', storage_path: 'documents/demo-doc-2-insurance.xlsx', file_url: '', file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file_size_bytes: 512000, from_date: toDateStr(-90), expiry_date: toDateStr(60), remind_me: true, reminder_days: 15, uploaded_by: DEMO_USER_ID, created_at: toDateStr(-30), updated_at: toDateStr(-30) },
    { id: 'demo-doc-3', title: 'Worker Safety Training', description: 'Induction training record', file_name: 'training-guide.pdf', storage_path: 'documents/demo-doc-3-training-guide.pdf', file_url: '', file_type: 'application/pdf', file_size_bytes: 1820000, from_date: toDateStr(-60), expiry_date: toDateStr(90), remind_me: false, reminder_days: 0, uploaded_by: 'demo-prof-sup1', created_at: toDateStr(-20), updated_at: toDateStr(-20) },
  ];

  const site_incharge_requests: SiteInchargeRequest[] = [
    { id: 'demo-req-1', user_id: 'demo-prof-inc3', site_id: null, status: 'Pending', requested_by: 'demo-prof-inc3', decided_by: null, decided_at: null, created_at: toDateStr(-1), updated_at: toDateStr(-1) },
    { id: 'demo-req-2', user_id: 'demo-prof-inc4', site_id: null, status: 'Pending', requested_by: 'demo-prof-inc4', decided_by: null, decided_at: null, created_at: toDateStr(-2), updated_at: toDateStr(-2) },
    { id: 'demo-req-3', user_id: 'demo-prof-inc5', site_id: null, status: 'Rejected', requested_by: 'demo-prof-inc5', decided_by: DEMO_USER_ID, decided_at: toDateStr(-3), created_at: toDateStr(-3), updated_at: toDateStr(-3) },
  ];

  const worker_change_requests: WorkerChangeRequest[] = [
    {
      id: 'demo-wcr-1', request_type: 'add', worker_id: null, site_id: 'demo-site-3',
      payload: { name: 'Ramesh Tudu', trade: 'Mason', mobile: '9000000020', daily_wage: 520, is_temporary: false },
      reason: 'Additional mason needed on bridge site', status: 'Pending', requested_by: 'demo-prof-sup1',
      decided_by: null, decided_at: null, created_at: toDateStr(-1), updated_at: toDateStr(-1),
    },
    {
      id: 'demo-wcr-2', request_type: 'delete', worker_id: 'demo-w-13', site_id: 'demo-site-3',
      payload: { name: 'Nitin Ekka' }, reason: 'Contract completed', status: 'Pending', requested_by: 'demo-prof-sup1',
      decided_by: null, decided_at: null, created_at: toDateStr(-1), updated_at: toDateStr(-1),
    },
    {
      id: 'demo-wcr-3', request_type: 'add', worker_id: null, site_id: 'demo-site-1',
      payload: { name: 'Farhan Sheikh', trade: 'Electrician', daily_wage: 620, is_temporary: false },
      reason: 'Temporary electrician', status: 'Approved', requested_by: 'demo-prof-inc1',
      decided_by: DEMO_USER_ID, decided_at: toDateStr(-3), created_at: toDateStr(-4), updated_at: toDateStr(-3),
    },
  ];

  const company_settings: CompanySettings = {
    id: true,
    company_name: 'Demo Construction Co.',
    tagline: 'Bridging communities, building futures (DEMO)',
    logo_url: null,
    phone: '0651-2200100',
    email: 'demo@cwms.local',
    address: 'Ring Road, Ranchi, Jharkhand',
    gst_number: '20DEMO00001A1Z5',
    updated_at: toDateStr(-10),
  };

  return {
    seq: { workerCode: 14, request: 10 },
    profiles,
    sites,
    workers,
    attendance,
    salary_advances,
    salary_payments,
    documents,
    site_incharge_requests,
    worker_change_requests,
    company_settings,
  };
}

export function createDemoDb(): DemoDb {
  const s = seed();
  const ms = new Date().toISOString();
  return {
    seq: { ...s.seq },
    profiles: s.profiles.map((p) => {
      const { role, ...profile } = p;
      return profile;
    }),
    user_roles: s.profiles.map((p, i) => ({
      id: `demo-role-${i}`,
      user_id: p.id,
      role: p.role,
      created_at: p.created_at,
    })),
    sites: s.sites.map((x) => ({ ...x })),
    workers: s.workers.map((x) => ({ ...x })),
    attendance: s.attendance.map((x) => ({ ...x })),
    salary_advances: s.salary_advances.map((x) => ({ ...x })),
    salary_payments: s.salary_payments.map((x) => ({ ...x })),
    documents: s.documents.map((x) => ({ ...x })),
    company_settings: [{ ...s.company_settings }],
    site_incharge_requests: s.site_incharge_requests.map((x) => ({ ...x })),
    worker_change_requests: s.worker_change_requests.map((x) => ({ ...x })),
    report_logs: [],
  };
}

let db: DemoDb | null = null;

export function getDb(): DemoDb {
  if (!db) db = createDemoDb();
  return db;
}

export function nextWorkerCode(db: DemoDb): string {
  const n = db.seq.workerCode;
  db.seq.workerCode += 1;
  return `W${String(n + 1).padStart(3, '0')}`;
}

export function nextId(db: DemoDb, prefix: string): string {
  const n = db.seq.request;
  db.seq.request += 1;
  return `${prefix}-${n}`;
}