import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { COMPANY_NAME } from '@/lib/company';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ExportType = 'salary-sheet' | 'monthly-attendance' | 'worker-advance' | 'site-attendance';

export interface ReportQuery {
  type: ExportType;
  month?: string;
  siteId?: string;
  workerId?: string;
  shift?: string;
  dateFrom?: string;
  dateTo?: string;
  advanceStatus?: string;
}

interface WorkerLite {
  id: string;
  worker_code: string;
  name: string;
  trade: string | null;
  daily_wage: number | null;
  pf_percentage: number | null;
  is_temporary: boolean;
  status: string;
  site_name: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
}

interface AttRow {
  worker_id: string;
  status: string;
  overtime: number;
  deduction: number;
  leave_type: string | null;
  attendance_date: string;
  shift: string;
}

interface AdvanceRow {
  id: string;
  amount: number;
  status: string;
  request_date: string;
  reason: string | null;
  remarks: string | null;
  worker: { id?: string; worker_code: string; name: string } | null;
  approved_by_profile: { full_name: string } | null;
}

interface CompanyLike {
  company_name?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
}

const BORDER = { style: 'thin' as const, color: { argb: 'FFB9C7D6' } };
const BORDER_H = { style: 'thin' as const, color: { argb: 'FF8FAABB' } };

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function colLetter(index: number): string {
  let s = '';
  let i = index;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): number {
  return round2(n);
}

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, lastCol: number) {
  const r = ws.getRow(row);
  r.height = 24;
  for (let c = 1; c <= lastCol; c++) {
    const cell = r.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
  }
}

function styleDataCell(cell: ExcelJS.Cell, isLastRow = false) {
  cell.alignment = { vertical: 'middle', wrapText: false };
  cell.border = { top: BORDER, bottom: isLastRow ? BORDER_H : BORDER, left: BORDER, right: BORDER };
}

function setWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.columns = widths.map((w, i) => ({ width: w, key: `c${i}` }));
}

function safe(n: number | null | undefined): number {
  return Number(n ?? 0) || 0;
}

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ReportQuery;
  try {
    body = (await request.json()) as ReportQuery;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, month = '', siteId = 'all', workerId = 'all', shift = 'all', dateFrom = '', dateTo = '', advanceStatus = 'all' } =
    body;

  let effMonth = month;
  if (!effMonth) {
    const d = new Date();
    effMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  if (!type) {
    return NextResponse.json({ error: 'Missing report type' }, { status: 400 });
  }

  const { data: companyRow } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  const company: CompanyLike = (companyRow as CompanyLike | null) ?? {};

  const wb = new ExcelJS.Workbook();
  wb.creator = COMPANY_NAME;

  // Load company logo (public URL, embeddable server-side)
  let logoImageId: number | null = null;
  const logoSource = company.logo_url ?? `${request.nextUrl.origin}/logo.png`;
  if (logoSource) {
    try {
      const res = await fetch(logoSource, { cache: 'no-store' });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('svg')) {
          const extension = contentType.includes('png') ? 'png' : 'jpeg';
          logoImageId = wb.addImage({ buffer: buf as unknown as Uint8Array, extension });
        }
      }
    } catch {
      // Logo is optional
    }
  }

  const genDate = new Date().toISOString().slice(0, 10);

  // ---------- shared data ----------
  let workers: WorkerLite[] = [];
  let attRows: AttRow[] = [];
  let advances: AdvanceRow[] = [];

  if (type === 'salary-sheet' || type === 'monthly-attendance' || type === 'site-attendance') {
    const [year, mon] = effMonth.split('-');
    const startDate = `${year}-${mon}-01`;
    const endDate = `${year}-${mon}-${String(daysInMonth(effMonth)).padStart(2, '0')}`;

    let wq = supabase
      .from('workers')
      .select(
        'id, worker_code, name, trade, daily_wage, pf_percentage, is_temporary, status, bank_name, account_number, ifsc, branch, site:sites(site_name)'
      )
      .order('name');
    if (siteId !== 'all') wq = wq.eq('site_id', siteId);
    const { data: wData, error: wErr } = await wq;
    let wRows = wData as unknown as any[] | null;
    if (wErr || !wRows) {
      const wq2 = supabase
        .from('workers')
        .select(
          'id, worker_code, name, trade, daily_wage, pf_percentage, is_temporary, status, site:sites(site_name)'
        )
        .order('name');
      if (siteId !== 'all') wq2.eq('site_id', siteId);
      const r2 = await wq2;
      wRows = r2.data as unknown as any[] | null;
    }
    workers = ((wRows ?? []) as any[]).map((w) => ({
      id: w.id,
      worker_code: w.worker_code,
      name: w.name,
      trade: w.trade ?? '',
      daily_wage: safe(w.daily_wage),
      pf_percentage: safe(w.pf_percentage),
      is_temporary: !!w.is_temporary,
      status: w.status,
      site_name: w.site?.site_name ?? '—',
      bank_name: w.bank_name ?? null,
      account_number: w.account_number ?? null,
      ifsc: w.ifsc ?? null,
      branch: w.branch ?? null,
    }));

    let aq = supabase
      .from('attendance')
      .select('worker_id, status, overtime, deduction, leave_type, attendance_date, shift')
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate);
    if (siteId !== 'all') aq = aq.eq('site_id', siteId);
    if (workerId !== 'all') aq = aq.eq('worker_id', workerId);
    if (shift !== 'all') aq = aq.eq('shift', shift);
    const { data: aData } = await aq;
    attRows = ((aData as unknown as AttRow[]) ?? []).map((r) => ({
      ...r,
      overtime: safe(r.overtime),
      deduction: safe(r.deduction),
    }));
  }

  if (type === 'worker-advance') {
    let aq2 = supabase
      .from('salary_advances')
      .select(
        'id, amount, status, request_date, reason, remarks, worker:workers(worker_code, name), approved_by_profile:profiles!salary_advances_approved_by_fkey(full_name)'
      )
      .order('request_date', { ascending: false });
    if (dateFrom) aq2 = aq2.gte('request_date', dateFrom);
    if (dateTo) aq2 = aq2.lte('request_date', dateTo);
    if (advanceStatus !== 'all') aq2 = aq2.eq('status', advanceStatus);
    const { data: adv } = await aq2;
    advances = ((adv as unknown as AdvanceRow[]) ?? []).map((a) => ({ ...a, amount: safe(a.amount) }));
  }

  // Salary sheet also needs advances
  if (type === 'salary-sheet') {
    let aq3 = supabase
      .from('salary_advances')
      .select(
        'id, amount, status, request_date, reason, remarks, worker:workers(id, worker_code, name), approved_by_profile:profiles!salary_advances_approved_by_fkey(full_name)'
      );
    const { data: advAll } = await aq3;
    advances = ((advAll as unknown as AdvanceRow[]) ?? []).map((a) => ({ ...a, amount: safe(a.amount) }));
  }

  // ---------- helper: company header ----------
  const addHeader = (
    ws: ExcelJS.Worksheet,
    title: string,
    subtitle: string,
    lastCol: number
  ) => {
    ws.getRow(1).height = logoImageId != null ? 58 : 30;
    const nameCell = ws.getCell(1, 2);
    ws.getRow(1).height = 58;
    ws.getCell(1, 1).value = '';
    ws.mergeCells(1, 2, 1, lastCol);
    nameCell.value = COMPANY_NAME;
    nameCell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    nameCell.alignment = { vertical: 'middle' };
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14263B' } };
    for (let c = 2; c <= lastCol; c++) {
      ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14263B' } };
    }

    const contact =
      [
        company.address || null,
        company.phone ? `Ph: ${company.phone}` : null,
        company.email ? `Email: ${company.email}` : null,
        company.gst_number ? `GST: ${company.gst_number}` : null,
      ].filter(Boolean) as string[];
    ws.getRow(2).height = 18;
    ws.mergeCells(2, 2, 2, lastCol);
    const tagCell = ws.getCell(2, 2);
    tagCell.value = contact.length ? contact.join('  |  ') : company.tagline ?? '';
    tagCell.font = { size: 9, color: { argb: 'FF6B7A8D' } };

    ws.getRow(3).height = 22;
    ws.mergeCells(3, 1, 3, lastCol);
    ws.getCell(3, 1).value = title;
    ws.getCell(3, 1).font = { bold: true, size: 13 };
    ws.getCell(3, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1F8' } };
    ws.getCell(3, 1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getRow(4).height = 16;
    ws.mergeCells(4, 1, 4, lastCol);
    ws.getCell(4, 1).value = subtitle;
    ws.getCell(4, 1).font = { size: 9, italic: true, color: { argb: 'FF6B7A8D' } };
    ws.getCell(4, 1).alignment = { horizontal: 'center' };

    if (logoImageId != null) {
      try {
        ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 50 } });
      } catch {
        // ignore image placement errors
      }
    }
  };

  // ============ SALARY SHEET (main workbook) ============
  if (type === 'salary-sheet') {
    const startDate = `${effMonth}-01`;
    const endDate = `${effMonth}-${String(daysInMonth(effMonth)).padStart(2, '0')}`;

    const attByWorker: Record<string, { status: string; overtime: number; deduction: number; leave_type: string | null; attendance_date: string }[]> = {};
    for (const r of attRows) {
      (attByWorker[r.worker_id] ??= []).push(r);
    }

    const workerMap = new Map(workers.map((w) => [w.id, w]));
    for (const wid of Object.keys(attByWorker)) {
      if (!workerMap.has(wid)) workerMap.set(wid, { id: wid, worker_code: '', name: '(removed)', trade: '', daily_wage: 0, pf_percentage: 0, is_temporary: false, status: '', site_name: '—', bank_name: null, account_number: null, ifsc: null, branch: null });
    }

    const advByWorker: Record<string, { amount: number; status: string; request_date: string }> = {};
    for (const a of advances) {
      const widReal = a.worker?.id ?? null;
      if (!widReal || !workerMap.has(widReal)) continue;
      if (a.status === 'Approved') {
        const amt = safe(a.amount);
        advByWorker[widReal] = { amount: (advByWorker[widReal]?.amount ?? 0) + amt, status: 'Approved', request_date: a.request_date };
      }
    }

    // Salary payments (On Site / In Office) recorded via the portal
    const payByWorker: Record<string, { onSite: number; office: number }> = {};
    try {
      const { data: payAll } = await supabase
        .from('salary_payments')
        .select('worker_id, amount, payment_location, payment_date, salary_month');
      for (const p of (payAll ?? []) as { worker_id: string; amount: number; payment_location: string; payment_date: string; salary_month: string }[]) {
        if (p.salary_month !== month) continue;
        const cur = (payByWorker[p.worker_id] ??= { onSite: 0, office: 0 });
        if (p.payment_location === 'In Office') cur.office += safe(p.amount);
        else cur.onSite += safe(p.amount);
      }
    } catch {
      // salary_payments table may not exist yet
    }

    const regular = [...workerMap.values()].filter((w) => !w.is_temporary && w.worker_code);
    const temp = [...workerMap.values()].filter((w) => w.is_temporary && w.worker_code);

    interface SalaryRow {
      worker: WorkerLite;
      present: number; half: number; paidLeave: number; unpaidLeave: number; absent: number;
      daysPaid: number; calcText: string;
      otHours: number; otAmount: number; pf: number; deduction: number; gross: number;
      monthlySalary: number; totalSalary: number; netDue: number;
      paidOnSite: number; paidOffice: number; totalDue: number;
      advanceBalance: number;
    }
    const rows: SalaryRow[] = [];
    let grossT = 0, otT = 0, otAmtT = 0, pfT = 0, dedT = 0, paidOnSiteT = 0, advBalT = 0;
    let monthlySalaryT = 0, totalSalaryT = 0, netDueT = 0, paidOfficeT = 0, totalDueT = 0;
    let presentT = 0, halfT = 0, paidT = 0, unpaidT = 0, absentT = 0;

    for (const w of regular) {
      const arr = attByWorker[w.id] ?? [];
      let present = 0, half = 0, paidLeave = 0, unpaidLeave = 0, absent = 0, otH = 0, ded = 0;
      for (const r of arr) {
        if (r.status === 'Present') present++;
        else if (r.status === 'Half Day') half++;
        else if (r.status === 'Absent') absent++;
        else if (r.status === 'Leave') {
          if (r.leave_type === 'Paid') paidLeave++;
          else unpaidLeave++;
        }
        otH += safe(r.overtime);
        ded += safe(r.deduction);
      }
      const wage = safe(w.daily_wage);
      const pfPct = safe(w.pf_percentage) || 0;
      const daysPaid = present + half * 0.5 + paidLeave;
      const gross = money(wage * daysPaid);
      const otAmount = money((wage / 8) * otH);
      const pf = money((gross * pfPct) / 100);
      const monthlySalary = money(wage * 30);
      const totalSalary = money(Math.min(gross, monthlySalary) + otAmount);
      const netDue = money(totalSalary - pf - ded);
      const pay = payByWorker[w.id] ?? { onSite: 0, office: 0 };
      const paidOnSite = money(pay.onSite);
      const paidOffice = money(pay.office);
      const totalDue = money(netDue - paidOnSite - paidOffice);
      const advanceBalance = money(advByWorker[w.id]?.amount ?? 0);
      const calcText = `${Number.isInteger(daysPaid) ? daysPaid : daysPaid.toFixed(1)} days × ₹${wage}/day = ₹${gross}`;
      rows.push({ worker: w, present, half, paidLeave, unpaidLeave, absent, daysPaid, calcText, otHours: money(otH), otAmount, pf, deduction: ded, gross, monthlySalary, totalSalary, netDue, paidOnSite, paidOffice, totalDue, advanceBalance });
      presentT += present; halfT += half; paidT += paidLeave; unpaidT += unpaidLeave; absentT += absent;
      otT += otH; otAmtT += otAmount; pfT += pf; dedT += ded; grossT += gross; paidOnSiteT += paidOnSite; advBalT += advanceBalance;
      monthlySalaryT += monthlySalary; totalSalaryT += totalSalary; netDueT += netDue; paidOfficeT += paidOffice; totalDueT += totalDue;
    }

    // ---- KPI Sheet ----
    const kpi = wb.addWorksheet('KPI Summary');
    setWidths(kpi, [34, 26]);
    addHeader(kpi, 'Workforce KPI Summary', `Month: ${monthLabel(effMonth)}  •  Generated: ${genDate}`, 2);
    const kpiStart = 6;
    const kpiRows: [string, string | number][] = [
      ['Month', monthLabel(effMonth)],
      ['Workers in scope', regular.length],
      ['Temporary workers', temp.length],
      ['Attendance records', attRows.length],
      ['Present (days)', presentT],
      ['Half Day (days)', halfT],
      ['Paid Leave (days)', paidT],
      ['Unpaid Leave (days)', unpaidT],
      ['Absent (days)', absentT],
      ['Overtime (hours)', otT],
      ['Monthly Salary (₹)', money(monthlySalaryT)],
      ['Total Salary (₹)', money(totalSalaryT)],
      ['Overtime Amount (₹)', money(otAmtT)],
      ['PF Deduction (₹)', money(pfT)],
      ['Attendance Deductions (₹)', money(dedT)],
      ['Net Salary Due (₹)', money(netDueT)],
      ['Salary Paid - On Site (₹)', money(paidOnSiteT)],
      ['Salary Paid - In Office (₹)', money(paidOfficeT)],
      ['Total Due (₹)', money(totalDueT)],
      ['Total Advance Balance (₹)', money(advBalT)],
    ];
    kpiRows.forEach((row, i) => {
      const r = kpi.getRow(kpiStart + i);
      r.getCell(1).value = row[0];
      r.getCell(2).value = row[1];
      r.getCell(1).font = { bold: true, size: 11 };
      if (row[0] === 'Total Due (₹)') {
        r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        r.getCell(2).font = { bold: true, size: 12 };
      }
      r.getCell(2).numFmt = typeof row[1] === 'number' && String(row[0]).includes('₹') ? '#,##0.00' : 'General';
      r.height = 20;
      styleDataCell(r.getCell(1));
      styleDataCell(r.getCell(2));
    });

    // ---- Salary Sheet ----
    const ss = wb.addWorksheet('Salary Sheet');
    ss.views = [{ state: 'frozen', ySplit: 8 }];
    const ssCols = 19;
    setWidths(ss, [6, 26, 14, 20, 12, 12, 10, 14, 14, 12, 14, 14, 12, 12, 14, 20, 18, 16, 14]);
    addHeader(ss, 'Monthly Salary Sheet', '', ssCols);
    const siteLabel =
      siteId === 'all'
        ? 'ALL SITES'
        : (workers.find((w) => w.site_name)?.site_name ?? 'SELECTED SITE');
    ss.getCell(3, 1).value = `CLIENT : ${siteLabel}`;
    ss.getCell(3, 1).font = { bold: true, size: 12, color: { argb: 'FF14263B' } };
    ss.getCell(4, 1).value = `MONTH : ${monthLabel(effMonth).toUpperCase()}`;
    ss.getCell(4, 1).font = { bold: true, size: 11, color: { argb: 'FF14263B' } };
    const mainHeaders = ['S.No', 'Employee Name', 'Employee Code', 'Designation', 'Status', 'Working Days', 'OT (hrs)', 'Monthly Salary (₹)', 'Total Salary (₹)', 'PF (₹)', 'Deduction (₹)', 'Net Salary Due (₹)', 'Salary Paid', '', 'Total Due (₹)', 'Bank Name', 'Account No.', 'Branch', 'IFSC'];
    const subHeaders = ['', '', '', '', '', '', '', '', '', '', '', '', 'Paid on Site (₹)', 'Paid in Office (₹)', '', '', '', '', ''];
    for (let c = 1; c <= ssCols; c++) {
      ss.getRow(6).getCell(c).value = mainHeaders[c - 1];
      ss.getRow(7).getCell(c).value = subHeaders[c - 1];
    }
    ss.mergeCells(6, 13, 6, 14);
    styleHeaderRow(ss, 6, ssCols);
    styleHeaderRow(ss, 7, ssCols);
    let rr = 8;
    const daysPaidT = rows.reduce((s, r) => s + r.daysPaid, 0);
    let sno = 0;
    for (const row of rows) {
      const w = row.worker;
      sno++;
      const cells: (string | number)[] = [
        sno, w.name, w.worker_code, w.trade ?? '', w.status ?? 'Active',
        row.daysPaid, row.otHours, money(row.monthlySalary), money(row.totalSalary), money(row.pf),
        money(row.deduction), money(row.netDue), money(row.paidOnSite), money(row.paidOffice),
        money(row.totalDue),
        w.bank_name ?? '', w.account_number ?? '', w.branch ?? '', w.ifsc ?? '',
      ];
      cells.forEach((v, i) => {
        const cell = ss.getRow(rr).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        if (i === 5 || i === 6) cell.numFmt = '0.0';
        else if (i >= 7 && i <= 14) cell.numFmt = '#,##0.00';
      });
      ss.getRow(rr).height = 20;
      if (rr % 2 === 0) {
        ss.getRow(rr).eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F8FC' } };
        });
      }
      rr++;
    }
    // Totals row
    const totals: (string | number)[] = ['TOTAL', '', '', '', '', round2(daysPaidT), money(otT), money(monthlySalaryT), money(totalSalaryT), money(pfT), money(dedT), money(netDueT), money(paidOnSiteT), money(paidOfficeT), money(totalDueT), '', '', '', ''];
    totals.forEach((v, i) => {
      const cell = ss.getRow(rr).getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
      if (i === 5 || i === 6) cell.numFmt = '0.0';
      else if (i >= 7 && i <= 14) cell.numFmt = '#,##0.00';
    });
    ss.getRow(rr).height = 22;
    const noteRow = rr + 2;
    ss.getCell(noteRow, 1).value = 'Notes: Working Days = Present + Half Day × 0.5 + Paid Leave. Monthly Salary (cap) = Daily Wage × 30. Total Salary = (Daily Wage × Working Days), capped at Monthly Salary, + Overtime Amount. Overtime can push Total Salary above the Monthly Salary cap. PF = (Daily Wage × Working Days) × PF% (default 12%). Net Salary Due = Total Salary − PF − Deductions. Salary Paid = Salary Release entries recorded on the portal (On Site / In Office, whichever applies). Total Due = Net Salary Due − Salary Paid.';
    ss.getCell(noteRow, 1).font = { italic: true, size: 9, color: { argb: 'FF6B7A8D' } };
    ss.mergeCells(noteRow, 1, noteRow, ssCols);

    // ---- Attendance Register ----
    const reg = wb.addWorksheet('Attendance Register');
    reg.views = [{ state: 'frozen', ySplit: 7 }];
    const regHeaders = ['Date', 'Worker Code', 'Worker Name', 'Role', 'Site', 'Shift', 'Status', 'Leave Type', 'OT (hrs)', 'Deduction (₹)'];
    setWidths(reg, [14, 12, 24, 18, 22, 10, 12, 12, 10, 14]);
    addHeader(reg, 'Monthly Attendance Register', `Month: ${monthLabel(effMonth)}  •  Generated: ${genDate}`, regHeaders.length);
    for (let c = 1; c <= regHeaders.length; c++) reg.getRow(6).getCell(c).value = regHeaders[c - 1];
    styleHeaderRow(reg, 6, regHeaders.length);
    const siteName = new Map(workers.map((w) => [w.id, w.site_name]));
    const attSorted = [...attRows].sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
    let rr2 = 7;
    let regPresent = 0, regAbsent = 0, regHalf = 0, regPaid = 0, regUnpaid = 0, regOt = 0, regDed = 0;
    for (const r of attSorted) {
      const wm = workerMap.get(r.worker_id);
      const row = [
        r.attendance_date, wm?.worker_code ?? '', wm?.name ?? '', wm?.trade ?? '', wm?.site_name ?? siteName.get(r.worker_id) ?? '—',
        r.shift, r.status, r.leave_type ?? '', safe(r.overtime), safe(r.deduction),
      ];
      if (r.status === 'Present') regPresent++;
      else if (r.status === 'Absent') regAbsent++;
      else if (r.status === 'Half Day') regHalf++;
      else if (r.status === 'Leave') {
        if (r.leave_type === 'Paid') regPaid++; else regUnpaid++;
      }
      regOt += safe(r.overtime);
      regDed += safe(r.deduction);
      row.forEach((v, i) => {
        const cell = reg.getRow(rr2).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        if (i >= 8) cell.numFmt = i === 8 ? '0.0' : '#,##0.00';
      });
      reg.getRow(rr2).height = 18;
      rr2++;
    }
    const regTotals = [
      'TOTALS', '', '', '', '', '', `Present: ${regPresent}`, `Absent: ${regAbsent}`, `Half Day: ${regHalf}`, `Paid Leave: ${regPaid}`,
    ];
    const regLine2 = ['', '', '', '', '', '', `Unpaid Leave: ${regUnpaid}`, `OT (hrs): ${money(regOt)}`, `Deductions (₹): ${money(regDed)}`, ''];
    regTotals.forEach((v, i) => {
      const cell = reg.getRow(rr2).getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
    });
    regLine2.forEach((v, i) => {
      const cell = reg.getRow(rr2 + 1).getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
    });

    // ---- Site Attendance ----
    const sa = wb.addWorksheet('Site Attendance');
    const saHeaders = ['Site', 'Code', 'Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'Total', 'OT (hrs)'];
    setWidths(sa, [28, 10, 10, 10, 11, 11, 13, 10, 10]);
    addHeader(sa, 'Site-wise Attendance', `Month: ${monthLabel(effMonth)}  •  Generated: ${genDate}`, saHeaders.length);
    for (let c = 1; c <= saHeaders.length; c++) sa.getRow(6).getCell(c).value = saHeaders[c - 1];
    styleHeaderRow(sa, 6, saHeaders.length);
    const { data: sitesData } = await supabase.from('sites').select('id, site_name, site_code').order('site_name');
    const siteAgg: Record<string, { name: string; code: string; present: number; absent: number; half: number; paid: number; unpaid: number; total: number; ot: number }> = {};
    for (const r of attSorted) {
      const wm = workerMap.get(r.worker_id);
      const sKey = siteName.get(r.worker_id) ?? '—';
      const siteRow = (siteAgg[sKey] ??= { name: sKey, code: '', present: 0, absent: 0, half: 0, paid: 0, unpaid: 0, total: 0, ot: 0 });
      siteRow.total++;
      siteRow.ot += safe(r.overtime);
      if (r.status === 'Present') siteRow.present++;
      else if (r.status === 'Absent') siteRow.absent++;
      else if (r.status === 'Half Day') siteRow.half++;
      else if (r.status === 'Leave') { if (r.leave_type === 'Paid') siteRow.paid++; else siteRow.unpaid++; }
      void wm;
    }
    for (const s of (sitesData as { id: string; site_name: string; site_code: string }[] ?? [])) {
      if (siteName.size > 0 && Object.keys(siteAgg).length && siteAgg[s.site_name]) siteAgg[s.site_name].code = s.site_code;
    }
    let rr3 = 7;
    for (const k of Object.keys(siteAgg)) {
      const row = [siteAgg[k].name, siteAgg[k].code, siteAgg[k].present, siteAgg[k].absent, siteAgg[k].half, siteAgg[k].paid, siteAgg[k].unpaid, siteAgg[k].total, money(siteAgg[k].ot)];
      row.forEach((v, i) => {
        const cell = sa.getRow(rr3).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        if (i >= 8) cell.numFmt = '#,##0.0';
        else if (i >= 2) cell.numFmt = '0';
      });
      sa.getRow(rr3).height = 18;
      rr3++;
    }

    // ---- Temporary Workers (last sheet) ----
    const tw = wb.addWorksheet('Temporary Workers');
    const twHeaders = ['Code', 'Name', 'Role', 'Site', 'Daily Wage', 'Present', 'Half', 'Paid Lv', 'Unpaid Lv', 'OT (hrs)', 'Gross (₹)', 'Net (₹)'];
    setWidths(tw, [10, 24, 18, 22, 12, 9, 9, 9, 11, 10, 13, 13]);
    addHeader(tw, 'Temporary / Casual Workers', `Month: ${monthLabel(effMonth)}  •  Generated: ${genDate}`, twHeaders.length);
    for (let c = 1; c <= twHeaders.length; c++) tw.getRow(6).getCell(c).value = twHeaders[c - 1];
    styleHeaderRow(tw, 6, twHeaders.length);
    let rr4 = 7;
    let twNet = 0, twGross = 0;
    for (const w of temp) {
      const arr = attByWorker[w.id] ?? [];
      let present = 0, half = 0, paidLeave = 0, unpaidLeave = 0, otH = 0;
      for (const r of arr) {
        if (r.status === 'Present') present++;
        else if (r.status === 'Half Day') half++;
        else if (r.status === 'Leave') { if (r.leave_type === 'Paid') paidLeave++; else unpaidLeave++; }
        otH += safe(r.overtime);
      }
      const wage = safe(w.daily_wage);
      const gross = money(wage * (present + half * 0.5 + paidLeave));
      const net = money(gross + money((wage / 8) * otH));
      twGross += gross; twNet += net;
      const row = [w.worker_code, w.name, w.trade, w.site_name, money(wage), present, half, paidLeave, unpaidLeave, money(otH), money(gross), money(net)];
      row.forEach((v, i) => {
        const cell = tw.getRow(rr4).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        if (i >= 4) cell.numFmt = i === 4 || i >= 10 ? '#,##0.00' : '0';
      });
      tw.getRow(rr4).height = 18;
      rr4++;
    }
    ['TOTAL', '', '', '', '', '', '', '', '', '', money(twGross), money(twNet)].forEach((v, i) => {
      const cell = tw.getRow(rr4).getCell(i + 1);
      cell.value = v;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
      if (i >= 4) cell.numFmt = i === 4 || i >= 10 ? '#,##0.00' : '0';
    });

    const fileName = `salary-sheet-${effMonth}.xlsx`;
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  // ============ MONTHLY ATTENDANCE ============
  if (type === 'monthly-attendance') {
    const lastCol = 10;
    const ms = wb.addWorksheet('Monthly Attendance');
    ms.views = [{ state: 'frozen', ySplit: 7 }];
    setWidths(ms, [14, 12, 24, 18, 22, 10, 12, 12, 10, 14]);
    const headers = ['Date', 'Worker Code', 'Worker Name', 'Role', 'Site', 'Shift', 'Status', 'Leave Type', 'OT (hrs)', 'Deduction (₹)'];
    addHeader(ms, 'Monthly Attendance Report', `Month: ${monthLabel(effMonth)}  •  Site: ${siteId === 'all' ? 'All' : 'Selected'}  •  Generated: ${genDate}`, headers.length);
    for (let c = 1; c <= headers.length; c++) ms.getRow(6).getCell(c).value = headers[c - 1];
    styleHeaderRow(ms, 6, headers.length);
    const wm2 = new Map(workers.map((w) => [w.id, w]));
    const siteMap2 = new Map(workers.map((w) => [w.id, w.site_name]));
    let mrr = 7;
    let mP = 0, mA = 0, mH = 0, mPl = 0, mUl = 0, mOt = 0, mDed = 0;
    const sorted2 = [...attRows].sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));
    for (const r of sorted2) {
      const w = wm2.get(r.worker_id);
      if (r.status === 'Present') mP++;
      else if (r.status === 'Absent') mA++;
      else if (r.status === 'Half Day') mH++;
      else if (r.status === 'Leave') { if (r.leave_type === 'Paid') mPl++; else mUl++; }
      mOt += safe(r.overtime);
      mDed += safe(r.deduction);
      const row = [
        r.attendance_date, w?.worker_code ?? '', w?.name ?? '', w?.trade ?? '', w?.site_name ?? siteMap2.get(r.worker_id) ?? '—',
        r.shift, r.status, r.leave_type ?? '', safe(r.overtime), safe(r.deduction),
      ];
      row.forEach((v, i) => {
        const cell = ms.getRow(mrr).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        if (i >= 8) cell.numFmt = i === 8 ? '0.0' : '#,##0.00';
      });
      ms.getRow(mrr).height = 18;
      mrr++;
    }
    const summaryLine1 = ['TOTALS', '', '', '', '', '', `Present: ${mP}`, `Absent: ${mA}`, `Half Day: ${mH}`, `Paid Leave: ${mPl}`];
    const summaryLine2 = ['', '', '', '', '', '', `Unpaid Leave: ${mUl}`, `OT (hrs): ${money(mOt)}`, `Deductions (₹): ${money(mDed)}`, ''];
    summaryLine1.forEach((v, i) => {
      const cell = ms.getRow(mrr).getCell(i + 1);
      cell.value = v; cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
    });
    summaryLine2.forEach((v, i) => {
      const cell = ms.getRow(mrr + 1).getCell(i + 1);
      cell.value = v; cell.font = { bold: true };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
    });
    const fileName = `monthly-attendance-${month}.xlsx`;
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  // ============ ADVANCES ============
  if (type === 'worker-advance') {
    const lastCol = 7;
    const aw = wb.addWorksheet('Worker Advances');
    aw.views = [{ state: 'frozen', ySplit: 7 }];
    setWidths(aw, [14, 12, 24, 14, 12, 36, 20]);
    const headers = ['Date', 'Code', 'Worker', 'Amount (₹)', 'Status', 'Reason', 'Approved By'];
    addHeader(aw, 'Worker Advance Report', `Period: ${dateFrom || 'Start'} → ${dateTo || 'Today'}  •  Generated: ${genDate}`, headers.length);
    for (let c = 1; c <= headers.length; c++) aw.getRow(6).getCell(c).value = headers[c - 1];
    styleHeaderRow(aw, 6, headers.length);
    let arr2 = 7;
    let totalAmt = 0;
    for (const a of advances) {
      totalAmt += a.amount;
      const row = [a.request_date, a.worker?.worker_code ?? '', a.worker?.name ?? '', a.amount, a.status, a.reason ?? '', a.approved_by_profile?.full_name ?? ''];
      row.forEach((v, i) => {
        const cell = aw.getRow(arr2).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        if (i === 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
      });
      aw.getRow(arr2).height = 18;
      arr2++;
    }
    const totalRow = ['TOTAL', '', '', totalAmt, '', '', ''];
    totalRow.forEach((v, i) => {
      const cell = aw.getRow(arr2).getCell(i + 1);
      cell.value = v; cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
      cell.border = { top: BORDER_H, bottom: BORDER_H, left: BORDER, right: BORDER };
      if (i === 3) { cell.numFmt = '#,##0.00'; cell.alignment = { horizontal: 'right', vertical: 'middle' }; }
    });
    const fileName = `worker-advance-report-${genDate}.xlsx`;
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  // ============ SITE ATTENDANCE ============
  if (type === 'site-attendance') {
    const lastCol = 9;
    const sa2 = wb.addWorksheet('Site Attendance');
    setWidths(sa2, [28, 10, 10, 10, 11, 11, 13, 10, 10]);
    const headers = ['Site', 'Code', 'Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'Total', 'OT (hrs)'];
    addHeader(sa2, 'Site-wise Attendance', `Month: ${monthLabel(effMonth)}  •  Generated: ${genDate}`, headers.length);
    for (let c = 1; c <= headers.length; c++) sa2.getRow(6).getCell(c).value = headers[c - 1];
    styleHeaderRow(sa2, 6, headers.length);
    const workerMapSites = new Map(workers.map((w) => [w.id, w.site_name]));
    const siteAgg2: Record<string, { name: string; code: string; present: number; absent: number; half: number; paid: number; unpaid: number; total: number; ot: number }> = {};
    for (const r of attRows) {
      const sKey = workerMapSites.get(r.worker_id) ?? '—';
      const siteRow = (siteAgg2[sKey] ??= { name: sKey, code: '', present: 0, absent: 0, half: 0, paid: 0, unpaid: 0, total: 0, ot: 0 });
      siteRow.total++;
      siteRow.ot += safe(r.overtime);
      if (r.status === 'Present') siteRow.present++;
      else if (r.status === 'Absent') siteRow.absent++;
      else if (r.status === 'Half Day') siteRow.half++;
      else if (r.status === 'Leave') { if (r.leave_type === 'Paid') siteRow.paid++; else siteRow.unpaid++; }
    }
    let rr5 = 7;
    for (const k of Object.keys(siteAgg2)) {
      const row = [siteAgg2[k].name, siteAgg2[k].code, siteAgg2[k].present, siteAgg2[k].absent, siteAgg2[k].half, siteAgg2[k].paid, siteAgg2[k].unpaid, siteAgg2[k].total, money(siteAgg2[k].ot)];
      row.forEach((v, i) => {
        const cell = sa2.getRow(rr5).getCell(i + 1);
        cell.value = v;
        styleDataCell(cell);
        cell.numFmt = i >= 2 && i !== 8 ? '0' : '#,##0.0';
      });
      sa2.getRow(rr5).height = 18;
      rr5++;
    }
    const fileName = `site-attendance-${effMonth}.xlsx`;
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
}