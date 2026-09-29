import {
  DEMO_USER_ID,
  getDb,
  nextId,
  nextWorkerCode,
} from './store';
import { currentMonthPrefix } from './store';

let installed = false;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function handleUsers(method: string, body: Record<string, unknown>): Response {
  const db = getDb();
  if (method === 'POST') {
    const email = String(body.email ?? '');
    const fullName = String(body.full_name ?? '');
    const role = String(body.role ?? '');
    if (!email || !fullName || !role) {
      return json(400, { error: 'Missing required fields' });
    }
    void body.password;
    const id = nextId(db, 'user');
    const now = nowIso();
    db.profiles.push({
      id,
      full_name: fullName,
      email,
      mobile: body.mobile ? String(body.mobile) : null,
      created_at: now,
      updated_at: now,
    });
    db.user_roles.push({ id: nextId(db, 'role'), user_id: id, role: role as 'admin' | 'supervisor' | 'site_incharge', created_at: now });
    return json(201, { id, email, full_name: fullName, role });
  }

  if (method === 'PATCH') {
    const userId = String(body.userId ?? '');
    const role = String(body.role ?? '');
    if (!userId || !role) return json(400, { error: 'Missing or invalid fields' });
    if (userId === DEMO_USER_ID) return json(400, { error: 'You cannot change your own role' });
    db.user_roles = db.user_roles.filter((r) => r.user_id !== userId);
    db.user_roles.push({ id: nextId(db, 'role'), user_id: userId, role: role as 'admin' | 'supervisor' | 'site_incharge', created_at: nowIso() });
    if (role === 'site_incharge') {
      for (const s of db.sites) {
        if (s.site_incharge_id === userId) s.site_incharge_id = null;
      }
      const existing = db.site_incharge_requests.findIndex((r) => r.user_id === userId);
      if (existing >= 0) {
        db.site_incharge_requests[existing] = {
          ...db.site_incharge_requests[existing],
          site_id: null,
          status: 'Pending',
          decided_by: null,
          decided_at: null,
          updated_at: nowIso(),
        };
      } else {
        db.site_incharge_requests.push({
          id: nextId(db, 'req'),
          user_id: userId,
          site_id: null,
          status: 'Pending',
          requested_by: userId,
          decided_by: null,
          decided_at: null,
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
    } else {
      for (const r of db.site_incharge_requests) {
        if (r.user_id === userId) {
          r.status = 'Rejected';
          r.decided_by = DEMO_USER_ID;
          r.decided_at = nowIso();
          r.updated_at = nowIso();
        }
      }
      for (const s of db.sites) {
        if (s.site_incharge_id === userId) s.site_incharge_id = null;
      }
    }
    return json(200, { id: userId, role });
  }

  if (method === 'DELETE') {
    const userId = String(body.userId ?? '');
    if (!userId) return json(400, { error: 'Missing user id' });
    if (userId === DEMO_USER_ID) return json(400, { error: 'You cannot delete your own account' });
    db.profiles = db.profiles.filter((p) => p.id !== userId);
    db.user_roles = db.user_roles.filter((r) => r.user_id !== userId);
    db.site_incharge_requests = db.site_incharge_requests.filter((r) => r.user_id !== userId);
    db.worker_change_requests = db.worker_change_requests.filter((r) => r.requested_by !== userId);
    for (const s of db.sites) {
      if (s.site_incharge_id === userId) s.site_incharge_id = null;
      if (s.supervisor_id === userId) s.supervisor_id = null;
    }
    return json(200, { success: true });
  }

  return json(405, { error: 'Method not allowed' });
}

function handleSiteIncharge(body: Record<string, unknown>): Response {
  const db = getDb();
  const requestId = String(body.requestId ?? '');
  const action = String(body.action ?? '');
  const req = db.site_incharge_requests.find((r) => r.id === requestId);
  if (!req) return json(404, { error: 'Request not found' });
  if (req.status !== 'Pending') return json(400, { error: 'Request has already been decided' });

  if (action === 'approve') {
    const siteId = body.siteId ? String(body.siteId) : '';
    if (!siteId) return json(400, { error: 'A site must be assigned on approval' });
    for (const s of db.sites) {
      if (s.site_incharge_id === req.user_id) s.site_incharge_id = null;
    }
    const site = db.sites.find((s) => s.id === siteId);
    if (site) site.site_incharge_id = req.user_id;
    req.site_id = siteId;
    req.status = 'Approved';
  } else {
    req.status = 'Rejected';
  }
  req.decided_by = DEMO_USER_ID;
  req.decided_at = nowIso();
  req.updated_at = nowIso();
  return json(200, { success: true, status: req.status });
}

function handleWorkerChange(body: Record<string, unknown>): Response {
  const db = getDb();
  const requestId = String(body.requestId ?? '');
  const action = String(body.action ?? '');
  const req = db.worker_change_requests.find((r) => r.id === requestId);
  if (!req) return json(404, { error: 'Request not found' });
  if (req.status !== 'Pending') return json(400, { error: 'Request has already been decided' });

  if (action === 'approve') {
    if (req.request_type === 'add') {
      const payload = (req.payload ?? {}) as Record<string, unknown>;
      if (!payload.name || !payload.trade) {
        return json(400, { error: 'Request payload is missing worker details' });
      }
      const now = nowIso();
      db.workers.push({
        id: nextId(db, 'w'),
        worker_code: nextWorkerCode(db),
        name: String(payload.name),
        mobile: payload.mobile ? String(payload.mobile) : null,
        address: payload.address ? String(payload.address) : null,
        aadhaar: payload.aadhaar ? String(payload.aadhaar) : null,
        trade: String(payload.trade),
        daily_wage: payload.daily_wage == null ? null : Number(payload.daily_wage),
        pf_percentage: payload.pf_percentage == null ? 12 : Number(payload.pf_percentage),
        joining_date: payload.joining_date ? String(payload.joining_date) : null,
        site_id: req.site_id,
        photo_url: null,
        is_temporary: Boolean(payload.is_temporary),
        bank_name: payload.bank_name ? String(payload.bank_name) : null,
        account_number: payload.account_number ? String(payload.account_number) : null,
        ifsc: payload.ifsc ? String(payload.ifsc) : null,
        branch: payload.branch ? String(payload.branch) : null,
        status: (payload.status ? String(payload.status) : 'Active') as 'Active' | 'Inactive',
        working_place: payload.working_place ? String(payload.working_place) : null,
        work_type: payload.work_type ? String(payload.work_type) : null,
        working_since: payload.working_since ? String(payload.working_since) : null,
        created_at: now,
        updated_at: now,
      });
    } else if (req.request_type === 'delete') {
      if (!req.worker_id) return json(400, { error: 'Request has no worker to delete' });
      const wid = req.worker_id;
      db.workers = db.workers.filter((w) => w.id !== wid);
      db.attendance = db.attendance.filter((a) => a.worker_id !== wid);
      db.salary_advances = db.salary_advances.filter((a) => a.worker_id !== wid);
      db.salary_payments = db.salary_payments.filter((p) => p.worker_id !== wid);
    }
  }

  req.status = action === 'approve' ? 'Approved' : 'Rejected';
  req.decided_by = DEMO_USER_ID;
  req.decided_at = nowIso();
  req.updated_at = nowIso();
  return json(200, { success: true, status: req.status });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

async function handleReports(body: Record<string, unknown>): Promise<Response> {
  const db = getDb();
  const excelModule = await import('exceljs');
  const ExcelJS = excelModule.default ?? excelModule;
  const wb = new ExcelJS.Workbook();
  const type = String(body.type ?? '');
  const month = String(body.month ?? currentMonthPrefix());
  const siteId = String(body.siteId ?? 'all');
  const workerId = String(body.workerId ?? 'all');
  const shift = String(body.shift ?? 'all');
  const dateFrom = String(body.dateFrom ?? '');
  const dateTo = String(body.dateTo ?? '');
  const advanceStatus = String(body.advanceStatus ?? 'all');

  if (type === 'salary-sheet') {
    const [year, mon] = month.split('-').map(Number);
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
    const endDay = daysInMonth(year, mon - 1);
    const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const workers = db.workers.filter((w) => siteId === 'all' || w.site_id === siteId);
    const att = db.attendance.filter(
      (a) => a.attendance_date >= startDate && a.attendance_date <= endDate && (siteId === 'all' || a.site_id === siteId)
    );
    const payMap = new Map<string, { onSite: number; office: number }>();
    for (const p of db.salary_payments) {
      if (p.salary_month !== month) continue;
      const cur = payMap.get(p.worker_id) ?? { onSite: 0, office: 0 };
      if (p.payment_location === 'In Office') cur.office += Number(p.amount);
      else cur.onSite += Number(p.amount);
      payMap.set(p.worker_id, cur);
    }
    const attMap = new Map<string, typeof att>();
    for (const r of att) {
      const list = attMap.get(r.worker_id) ?? [];
      list.push(r);
      attMap.set(r.worker_id, list);
    }

    const rows = workers.map((w) => {
      const a = attMap.get(w.id) ?? [];
      let present = 0, half = 0, paid = 0, unpaid = 0, absent = 0, ot = 0, ded = 0;
      for (const r of a) {
        if (r.status === 'Present') present++;
        else if (r.status === 'Half Day') half++;
        else if (r.status === 'Absent') absent++;
        else if (r.status === 'Leave') { if (r.leave_type === 'Paid') paid++; else unpaid++; }
        ot += r.overtime ?? 0;
        ded += r.deduction ?? 0;
      }
      const daily = Number(w.daily_wage ?? 0);
      const pfPct = Number(w.pf_percentage ?? 12);
      const daysPaid = present + half * 0.5 + paid;
      const gross = round2(daily * daysPaid);
      const otAmt = round2(daily > 0 ? (daily / 8) * ot : 0);
      const pf = round2((gross * pfPct) / 100);
      const pay = payMap.get(w.id) ?? { onSite: 0, office: 0 };
      const monthly = round2(daily * 30);
      const totalSalary = round2(Math.min(gross, monthly) + otAmt);
      const netDue = round2(totalSalary - pf - ded);
      const totalDue = round2(netDue - pay.onSite - pay.office);
      return { w, daysPaid, ot, monthly, totalSalary, pf, ded, netDue, onSite: pay.onSite, office: pay.office, totalDue, isTemp: w.is_temporary, site: w.site_id ? db.sites.find((s) => s.id === w.site_id)?.site_name ?? '' : '' };
    });
    const sorted = [...rows.filter((r) => !r.isTemp), ...rows.filter((r) => r.isTemp)];

    const sheet = wb.addWorksheet('Salary Sheet');
    sheet.addRow([db.company_settings[0]?.company_name ?? 'Construction Workforce Management System']);
    sheet.addRow(['SALARY SHEET — ' + month]);
    sheet.addRow(['MONTH : ' + month]);
    sheet.addRow([]);
    const headers = ['S.No', 'Employee Name', 'Employee Code', 'Designation', 'Status', 'Working Days', 'OT (hrs)', 'Monthly Salary (₹)', 'Total Salary (₹)', 'PF (₹)', 'Deduction (₹)', 'Net Salary Due (₹)', 'Paid on Site (₹)', 'Paid in Office (₹)', 'Total Due (₹)', 'Bank Name', 'Account No.', 'Branch', 'IFSC'];
    sheet.addRow(headers);
    sorted.forEach((r, i) => {
      sheet.addRow([
        i + 1, r.w.name, r.w.worker_code, r.w.trade ?? '', r.isTemp ? 'TEMPORARY' : 'FULL TIME',
        r.daysPaid, r.ot, r.monthly, r.totalSalary, r.pf, r.ded, r.netDue, r.onSite, r.office, r.totalDue,
        r.w.bank_name ?? '', r.w.account_number ?? '', r.w.branch ?? '', r.w.ifsc ?? '',
      ]);
    });
    sheet.addRow([]);
    sheet.addRow([
      'TOTAL', '', '', '', '', '',
      rows.reduce((s, r) => s + r.daysPaid, 0),
      rows.reduce((s, r) => s + r.ot, 0),
      rows.reduce((s, r) => s + r.monthly, 0),
      rows.reduce((s, r) => s + r.totalSalary, 0),
      rows.reduce((s, r) => s + r.pf, 0),
      rows.reduce((s, r) => s + r.ded, 0),
      rows.reduce((s, r) => s + r.netDue, 0),
      rows.reduce((s, r) => s + r.onSite, 0),
      rows.reduce((s, r) => s + r.office, 0),
      rows.reduce((s, r) => s + r.totalDue, 0),
    ]);
  } else if (type === 'monthly-attendance') {
    const [year, mon] = month.split('-').map(Number);
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
    const endDay = daysInMonth(year, mon - 1);
    const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    let attendance = db.attendance.filter(
      (a) => a.attendance_date >= startDate && a.attendance_date <= endDate
    );
    if (siteId !== 'all') attendance = attendance.filter((a) => a.site_id === siteId);
    if (workerId !== 'all') attendance = attendance.filter((a) => a.worker_id === workerId);
    if (shift !== 'all') attendance = attendance.filter((a) => a.shift === shift);

    const byWorker = new Map<string, typeof attendance>();
    for (const a of attendance) {
      const list = byWorker.get(a.worker_id) ?? [];
      list.push(a);
      byWorker.set(a.worker_id, list);
    }

    const sheet = wb.addWorksheet('Monthly Attendance');
    sheet.addRow(['MONTHLY ATTENDANCE — ' + month]);
    sheet.addRow([]);
    sheet.addRow(['S.No', 'Employee Code', 'Employee Name', ...Array.from({ length: endDay }, (_, i) => i + 1), 'P', 'HD', 'A', 'LP', 'LU', 'OT (hrs)']);
    let sNo = 0;
    const totals = { p: 0, hd: 0, a: 0, lp: 0, lu: 0, ot: 0 };
    for (const [wid, recs] of Array.from(byWorker.entries()).sort((a, b) => (db.workers.find((x) => x.id === a[0])?.worker_code ?? '').localeCompare(db.workers.find((x) => x.id === b[0])?.worker_code ?? ''))) {
      const w = db.workers.find((x) => x.id === wid);
      const code = w?.worker_code ?? '';
      const name = w?.name ?? '';
      const map = new Map<string, string>();
      for (const r of recs) {
        const dayKey = r.attendance_date.slice(8);
        map.set(dayKey, r.status === 'Present' ? 'P' : r.status === 'Half Day' ? 'HD' : r.status === 'Absent' ? 'A' : r.leave_type === 'Paid' ? 'LP' : 'LU');
      }
      const p = recs.filter((r) => r.status === 'Present').length;
      const hd = recs.filter((r) => r.status === 'Half Day').length;
      const a = recs.filter((r) => r.status === 'Absent').length;
      const lp = recs.filter((r) => r.status === 'Leave' && r.leave_type === 'Paid').length;
      const lu = recs.filter((r) => r.status === 'Leave' && r.leave_type !== 'Paid').length;
      const ot = recs.reduce((s, r) => s + (r.overtime ?? 0), 0);
      totals.p += p; totals.hd += hd; totals.a += a; totals.lp += lp; totals.lu += lu; totals.ot += ot;
      const dayCells = Array.from({ length: endDay }, (_, i) => map.get(String(i + 1).padStart(2, '0')) ?? '');
      sheet.addRow([++sNo, code, name, ...dayCells, p, hd, a, lp, lu, ot]);
    }
    sheet.addRow([]);
    sheet.addRow(['TOTAL', '', '', ...Array.from({ length: endDay }, () => ''), totals.p, totals.hd, totals.a, totals.lp, totals.lu, totals.ot]);
  } else if (type === 'site-attendance') {
    const [year, mon] = month.split('-').map(Number);
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
    const endDay = daysInMonth(year, mon - 1);
    const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

    const sheet = wb.addWorksheet('Site Attendance');
    sheet.addRow(['SITE ATTENDANCE — ' + month]);
    sheet.addRow([]);
    sheet.addRow(['Site Code', 'Site Name', 'Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'OT (hrs)', 'Total Records']);
    for (const site of db.sites) {
      const recs = db.attendance.filter(
        (a) => a.site_id === site.id && a.attendance_date >= startDate && a.attendance_date <= endDate
      );
      sheet.addRow([
        site.site_code, site.site_name,
        recs.filter((r) => r.status === 'Present').length,
        recs.filter((r) => r.status === 'Absent').length,
        recs.filter((r) => r.status === 'Half Day').length,
        recs.filter((r) => r.status === 'Leave' && r.leave_type === 'Paid').length,
        recs.filter((r) => r.status === 'Leave' && r.leave_type !== 'Paid').length,
        recs.reduce((s, r) => s + (r.overtime ?? 0), 0),
        recs.length,
      ]);
    }
  } else if (type === 'worker-advance') {
    let advances = db.salary_advances.slice();
    if (dateFrom) advances = advances.filter((a) => a.request_date >= dateFrom);
    if (dateTo) advances = advances.filter((a) => a.request_date <= dateTo);
    if (advanceStatus !== 'all') advances = advances.filter((a) => a.status === advanceStatus);
    if (siteId !== 'all' || workerId !== 'all') {
      advances = advances.filter((a) => {
        const w = db.workers.find((x) => x.id === a.worker_id);
        if (siteId !== 'all' && w?.site_id !== siteId) return false;
        if (workerId !== 'all' && a.worker_id !== workerId) return false;
        return true;
      });
    }

    const sheet = wb.addWorksheet('Worker Advances');
    sheet.addRow(['WORKER ADVANCES']);
    sheet.addRow([]);
    sheet.addRow(['Date', 'Worker Code', 'Worker Name', 'Site', 'Amount (₹)', 'Reason', 'Status', 'Approved By']);
    advances
      .slice()
      .sort((a, b) => (a.request_date < b.request_date ? 1 : -1))
      .forEach((a) => {
        const w = db.workers.find((x) => x.id === a.worker_id);
        const site = w?.site_id ? db.sites.find((s) => s.id === w.site_id)?.site_name ?? '' : '';
        const approver = a.approved_by ? db.profiles.find((p) => p.id === a.approved_by)?.full_name ?? '' : '';
        sheet.addRow([a.request_date, w?.worker_code ?? '', w?.name ?? '', site, a.amount, a.reason ?? '', a.status, approver]);
      });
  } else {
    return json(400, { error: 'Unknown report type' });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': blob.type,
    },
  });
}

function isSameOriginApi(input: RequestInfo | URL): string | null {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input && typeof input === 'object' && 'url' in input ? String(input.url) : '';
  if (!url) return null;
  if (!url.startsWith('/')) return null;
  if (!url.startsWith('/api/')) return null;
  return url;
}

async function handleDemoApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  const path = isSameOriginApi(input);
  if (!path) return null;

  const method = (init?.method ?? 'GET').toUpperCase();

  if (path.startsWith('/api/users')) {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method === 'GET') return json(200, []);
    return handleUsers(method, body);
  }
  if (path.startsWith('/api/site-incharge-requests')) {
    if (method !== 'POST') return null;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return handleSiteIncharge(body);
  }
  if (path.startsWith('/api/worker-change-requests')) {
    if (method !== 'POST') return null;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return handleWorkerChange(body);
  }
  if (path.startsWith('/api/reports')) {
    if (method !== 'POST') return null;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return handleReports(body);
  }
  return null;
}

export function installDemoFetch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    handleDemoApi(input, init).then((result) => result ?? realFetch(input, init));
}