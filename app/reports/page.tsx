'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileBarChart,
  Calendar,
  Users,
  Wallet,
  MapPin,
  Download,
  Loader2,
  FileSpreadsheet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/layout/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDate, downloadBlob } from '@/lib/utils';
import type { Site, Worker } from '@/types';

type ReportType = 'salary-sheet' | 'monthly-attendance' | 'worker-advance' | 'site-attendance';

type SalaryRow = {
  worker_id: string;
  worker_code: string;
  name: string;
  trade: string | null;
  daily_wage: number | null;
  is_temporary: boolean;
  site: string;
  present: number;
  half: number;
  paid: number;
  unpaid: number;
  absent: number;
  ot: number;
  ded: number;
  gross: number;
  otAmt: number;
  adv: number;
  net: number;
};

export default function ReportsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [siteId, setSiteId] = useState('all');
  const [workerId, setWorkerId] = useState('all');
  const [shift, setShift] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [advanceStatus, setAdvanceStatus] = useState('all');
  const [exporting, setExporting] = useState<ReportType | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sites').select('id, site_name').order('site_name');
      if (error) throw error;
      return (data as Site[]) ?? [];
    },
  });

  const { data: workers } = useQuery({
    queryKey: ['workers-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workers').select('id, name, worker_code, trade, site_id').order('name');
      if (error) throw error;
      return (data as Worker[]) ?? [];
    },
  });

  // Monthly Attendance Report
  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['report-monthly', month, siteId, workerId, shift],
    queryFn: async () => {
      const [year, mon] = month.split('-');
      const startDate = `${year}-${mon}-01`;
      const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const endDate = `${year}-${mon}-${String(endDay).padStart(2, '0')}`;

      let query = supabase
        .from('attendance')
        .select(`
          id, status, attendance_date, shift, overtime, deduction, leave_type,
          worker:workers(id, worker_code, name, trade),
          site:sites(id, site_name)
        `)
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate)
        .order('attendance_date', { ascending: true });

      if (siteId !== 'all') query = query.eq('site_id', siteId);
      if (workerId !== 'all') query = query.eq('worker_id', workerId);
      if (shift !== 'all') query = query.eq('shift', shift);

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as { id: string; status: string; attendance_date: string; shift: string; overtime: number | null; deduction: number | null; leave_type: string | null; worker: { id: string; worker_code: string; name: string; trade: string } | null; site: { id: string; site_name: string } | null }[]) ?? [];
    },
  });

  // Worker Advance Report
  const { data: advanceData, isLoading: advanceLoading } = useQuery({
    queryKey: ['report-advances', dateFrom, dateTo, siteId, workerId, advanceStatus],
    queryFn: async () => {
      let query = supabase
        .from('salary_advances')
        .select(`
          id, amount, status, request_date, reason, remarks,
          worker:workers(id, worker_code, name, trade, site_id),
          approved_by_profile:profiles!salary_advances_approved_by_fkey(full_name)
        `)
        .order('request_date', { ascending: false });

      if (dateFrom) query = query.gte('request_date', dateFrom);
      if (dateTo) query = query.lte('request_date', dateTo);
      if (advanceStatus !== 'all') query = query.eq('status', advanceStatus);

      const { data, error } = await query;
      if (error) throw error;

      let filtered = (data as unknown as { id: string; amount: number; status: string; request_date: string; reason: string | null; remarks: string | null; worker: { id: string; worker_code: string; name: string; trade: string; site_id: string | null } | null; approved_by_profile: { full_name: string } | null }[]) ?? [];
      if (siteId !== 'all') {
        filtered = filtered.filter((r) => r.worker?.site_id === siteId);
      }
      if (workerId !== 'all') {
        filtered = filtered.filter((r) => r.worker?.id === workerId);
      }
      return filtered;
    },
  });

  // Site-wise Attendance
  const { data: siteAttendanceData, isLoading: siteAttendanceLoading } = useQuery({
    queryKey: ['report-site-attendance', month],
    queryFn: async () => {
      const [year, mon] = month.split('-');
      const startDate = `${year}-${mon}-01`;
      const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const endDate = `${year}-${mon}-${String(endDay).padStart(2, '0')}`;

      const { data: sitesData } = await supabase
        .from('sites')
        .select('id, site_name, site_code')
        .order('site_name');

      const results: { site: string; site_code: string; present: number; absent: number; halfDay: number; paid: number; unpaid: number; ot: number; total: number }[] = [];

      for (const site of (sitesData as { id: string; site_name: string; site_code: string }[]) ?? []) {
        const { data } = await supabase
          .from('attendance')
          .select('status, overtime, leave_type')
          .eq('site_id', site.id)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate);

        const records = (data as { status: string; overtime: number | null; leave_type: string | null }[]) ?? [];
        results.push({
          site: site.site_name,
          site_code: site.site_code,
          present: records.filter((r) => r.status === 'Present').length,
          absent: records.filter((r) => r.status === 'Absent').length,
          halfDay: records.filter((r) => r.status === 'Half Day').length,
          paid: records.filter((r) => r.status === 'Leave' && r.leave_type === 'Paid').length,
          unpaid: records.filter((r) => r.status === 'Leave' && r.leave_type !== 'Paid').length,
          ot: records.reduce((s, r) => s + (r.overtime ?? 0), 0),
          total: records.length,
        });
      }
      return results;
    },
  });

  // Worker Summary Report
  const { data: workerSummaryData, isLoading: workerSummaryLoading } = useQuery({
    queryKey: ['report-worker-summary', siteId],
    queryFn: async () => {
      let query = supabase
        .from('workers')
        .select(`
          id, worker_code, name, trade, daily_wage, joining_date, status,
          working_place, work_type, working_since,
          site:sites(id, site_name)
        `)
        .order('name');

      if (siteId !== 'all') query = query.eq('site_id', siteId);

      const { data, error } = await query;
      if (error) throw error;

      const results: {
        worker_code: string; name: string; trade: string; daily_wage: number | null;
        joining_date: string | null; status: string; site: string;
        working_place: string | null; work_type: string | null; working_since: string | null;
        present: number; absent: number; halfDay: number; leave: number;
        advanceBalance: number; advanceCount: number;
      }[] = [];

      for (const w of (data as unknown as { id: string; worker_code: string; name: string; trade: string | null; daily_wage: number | null; joining_date: string | null; status: string; working_place: string | null; work_type: string | null; working_since: string | null; site: { id: string; site_name: string } | null }[]) ?? []) {
        const [attRes, advRes] = await Promise.all([
          supabase.from('attendance').select('status').eq('worker_id', w.id),
          supabase.from('salary_advances').select('amount, status').eq('worker_id', w.id),
        ]);

        const att = (attRes.data as { status: string }[]) ?? [];
        const adv = (advRes.data as { amount: number; status: string }[]) ?? [];
        const advanceBalance = adv
          .filter((a) => a.status === 'Approved')
          .reduce((s, a) => s + Number(a.amount), 0);

        results.push({
          worker_code: w.worker_code,
          name: w.name,
          trade: w.trade ?? '',
          daily_wage: w.daily_wage,
          joining_date: w.joining_date,
          status: w.status,
          site: w.site?.site_name ?? '—',
          working_place: w.working_place,
          work_type: w.work_type,
          working_since: w.working_since,
          present: att.filter((a) => a.status === 'Present').length,
          absent: att.filter((a) => a.status === 'Absent').length,
          halfDay: att.filter((a) => a.status === 'Half Day').length,
          leave: att.filter((a) => a.status === 'Leave').length,
          advanceBalance,
          advanceCount: adv.length,
        });
      }
      return results;
    },
  });

  // Salary Sheet data (mirrors the export)
  const { data: salaryData, isLoading: salaryLoading } = useQuery({
    queryKey: ['report-salary', month, siteId],
    queryFn: async () => {
      const [year, mon] = month.split('-');
      const startDate = `${year}-${mon}-01`;
      const endDay = new Date(parseInt(year), parseInt(mon), 0).getDate();
      const endDate = `${year}-${mon}-${String(endDay).padStart(2, '0')}`;

      let wq = supabase
        .from('workers')
        .select(`
          id, worker_code, name, trade, daily_wage, is_temporary, site_id,
          site:sites(id, site_name)
        `);
      if (siteId !== 'all') wq = wq.eq('site_id', siteId);
      const { data: allWorkers } = await wq;
      if (!allWorkers?.length) return { rows: [] as SalaryRow[], days: endDay };

      let aq = supabase
        .from('attendance')
        .select('worker_id, status, overtime, deduction, leave_type')
        .gte('attendance_date', startDate)
        .lte('attendance_date', endDate);
      if (siteId !== 'all') aq = aq.eq('site_id', siteId);
      const { data: allAttData } = await aq;

      let advQ = supabase
        .from('salary_advances')
        .select('worker_id, amount')
        .eq('status', 'Approved')
        .gte('request_date', startDate)
        .lte('request_date', endDate);
      const { data: advData } = await advQ;

      const attMap = new Map<string, { status: string; overtime: number | null; deduction: number | null; leave_type: string | null }[]>();
      (allAttData ?? []).forEach((r: { worker_id: string; status: string; overtime: number | null; deduction: number | null; leave_type: string | null }) => {
        if (!attMap.has(r.worker_id)) attMap.set(r.worker_id, []);
        attMap.get(r.worker_id)!.push(r);
      });

      const rows: SalaryRow[] = (allWorkers as unknown as { id: string; worker_code: string; name: string; trade: string | null; daily_wage: number | null; is_temporary: boolean; site: { site_name: string } | null }[]).map((w) => {
        const att = attMap.get(w.id) ?? [];
        let present = 0, half = 0, paid = 0, unpaid = 0, absent = 0, ot = 0, ded = 0;
        att.forEach((r) => {
          if (r.status === 'Present') present++;
          else if (r.status === 'Half Day') half++;
          else if (r.status === 'Absent') absent++;
          else if (r.status === 'Leave') { if (r.leave_type === 'Paid') paid++; else unpaid++; }
          ot += r.overtime ?? 0;
          ded += r.deduction ?? 0;
        });
        const daily = Number(w.daily_wage ?? 0);
        const gross = daily * (present + half * 0.5 + paid);
        const otAmt = daily > 0 ? (daily / 8) * ot : 0;
        const adv = advData?.filter((a) => a.worker_id === w.id).reduce((s, a) => s + Number(a.amount), 0) ?? 0;
        const net = gross + otAmt - ded - adv;
        return {
          worker_id: w.id,
          worker_code: w.worker_code,
          name: w.name,
          trade: w.trade ?? null,
          daily_wage: w.daily_wage,
          is_temporary: w.is_temporary ?? false,
          site: w.site?.site_name ?? '—',
          present, half, paid, unpaid, absent, ot, ded,
          gross: Math.round(gross),
          otAmt: Math.round(otAmt),
          adv: Math.round(adv),
          net: Math.round(net),
        };
      });

      const regular = rows.filter((r) => !r.is_temporary);
      const temp = rows.filter((r) => r.is_temporary);
      return { rows: [...regular, ...temp], days: endDay };
    },
  });

  const salaryTotals = useMemo(() => {
    const rows = salaryData?.rows ?? [];
    const base = rows.filter((r) => !r.is_temporary);
    return {
      payroll: base.reduce((s, r) => s + r.net, 0),
      gross: base.reduce((s, r) => s + r.gross, 0),
      otAmt: base.reduce((s, r) => s + r.otAmt, 0),
      otHrs: base.reduce((s, r) => s + r.ot, 0),
      ded: base.reduce((s, r) => s + r.ded, 0),
      adv: base.reduce((s, r) => s + r.adv, 0),
      present: base.reduce((s, r) => s + r.present, 0),
      absent: base.reduce((s, r) => s + r.absent, 0),
      half: base.reduce((s, r) => s + r.half, 0),
      paid: base.reduce((s, r) => s + r.paid, 0),
      unpaid: base.reduce((s, r) => s + r.unpaid, 0),
      count: base.length,
    };
  }, [salaryData]);

  const monthlyStats = useMemo(() => {
    if (!monthlyData) return { present: 0, absent: 0, halfDay: 0, paidLeave: 0, unpaidLeave: 0, ot: 0, total: 0, percentage: 0 };
    const present = monthlyData.filter((r) => r.status === 'Present').length;
    const absent = monthlyData.filter((r) => r.status === 'Absent').length;
    const halfDay = monthlyData.filter((r) => r.status === 'Half Day').length;
    const paidLeave = monthlyData.filter((r) => r.status === 'Leave' && r.leave_type === 'Paid').length;
    const unpaidLeave = monthlyData.filter((r) => r.status === 'Leave' && r.leave_type !== 'Paid').length;
    const ot = monthlyData.reduce((s, r) => s + (r.overtime ?? 0), 0);
    const total = monthlyData.length;
    const percentage = total > 0 ? Math.round(((present + halfDay * 0.5 + paidLeave) / total) * 100) : 0;
    return { present, absent, halfDay, paidLeave, unpaidLeave, ot, total, percentage };
  }, [monthlyData]);

  const advanceStats = useMemo(() => {
    if (!advanceData) return { total: 0, approved: 0, pending: 0, rejected: 0, amount: 0 };
    return {
      total: advanceData.length,
      approved: advanceData.filter((a) => a.status === 'Approved').length,
      pending: advanceData.filter((a) => a.status === 'Pending').length,
      rejected: advanceData.filter((a) => a.status === 'Rejected').length,
      amount: advanceData.filter((a) => a.status === 'Approved').reduce((s, a) => s + Number(a.amount), 0),
    };
  }, [advanceData]);

  const logReport = async (reportType: string, fileName: string) => {
    try {
      await supabase.from('report_logs').insert({
        report_type: reportType,
        generated_by: user?.id ?? null,
        file_name: fileName,
      });
      queryClient.invalidateQueries({ queryKey: ['report-logs'] });
    } catch {
      // non-critical
    }
  };

  const exportToExcel = async (type: ReportType) => {
    setExporting(type);
    let fileName = '';
    try {
      const payload: Record<string, string> = { type };
      if (type === 'salary-sheet' || type === 'monthly-attendance' || type === 'site-attendance') {
        payload.month = month;
        payload.siteId = siteId;
      }
      if (type === 'monthly-attendance') {
        payload.workerId = workerId;
        payload.shift = shift;
      }
      if (type === 'worker-advance') {
        payload.dateFrom = dateFrom;
        payload.dateTo = dateTo;
        payload.siteId = siteId;
        payload.workerId = workerId;
        payload.advanceStatus = advanceStatus;
      }

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error ?? 'Export failed');
      }

      const blob = await res.blob();
      fileName = getFileName(type);
      downloadBlob(blob, fileName);
      await logReport(getReportLabel(type), fileName);
      toast({ title: 'Export complete', description: 'Excel file has been downloaded.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast({ variant: 'destructive', title: 'Export failed', description: message });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <PageHeader title="Reports" description="Generate and export workforce reports" />

      <Tabs defaultValue="salary-sheet">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="salary-sheet" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salary Sheet</span>
            <span className="sm:hidden">Salary</span>
          </TabsTrigger>
          <TabsTrigger value="monthly-attendance" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Monthly Attendance</span>
            <span className="sm:hidden">Monthly</span>
          </TabsTrigger>
          <TabsTrigger value="worker-advance" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Worker Advance</span>
            <span className="sm:hidden">Advance</span>
          </TabsTrigger>
          <TabsTrigger value="site-attendance" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Site Attendance</span>
            <span className="sm:hidden">Site</span>
          </TabsTrigger>
          <TabsTrigger value="worker-summary" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Worker Summary</span>
            <span className="sm:hidden">Summary</span>
          </TabsTrigger>
        </TabsList>

        {/* Salary Sheet */}
        <TabsContent value="salary-sheet">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Monthly Salary Sheet</CardTitle>
                <Button size="sm" onClick={() => exportToExcel('salary-sheet')} disabled={exporting === 'salary-sheet' || !salaryData?.rows.length}>
                  {exporting === 'salary-sheet' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {sites?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <StatBox label="Workers" value={salaryTotals.count} color="text-foreground" />
                <StatBox label="Gross Salary" value={formatCurrency(salaryTotals.gross)} color="text-foreground" />
                <StatBox label="OT Amount" value={formatCurrency(salaryTotals.otAmt)} color="text-accent" />
                <StatBox label="Deductions" value={formatCurrency(-salaryTotals.ded)} color="text-destructive" />
                <StatBox label="Advances (month)" value={formatCurrency(-salaryTotals.adv)} color="text-warning" />
                <StatBox label="Net Payable" value={formatCurrency(salaryTotals.payroll)} color="text-success" />
                <StatBox label="OT (hrs)" value={salaryTotals.otHrs} color="text-accent" />
              </div>

              {salaryLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !salaryData?.rows.length ? (
                <EmptyState icon={FileSpreadsheet} title="No data" description="No workers found for the selected month and site." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Worker</TableHead>
                        <TableHead className="hidden md:table-cell">Role</TableHead>
                        <TableHead className="hidden lg:table-cell">Site</TableHead>
                        <TableHead className="text-center">Days</TableHead>
                        <TableHead className="text-center">P</TableHead>
                        <TableHead className="text-center">H</TableHead>
                        <TableHead className="text-center">PL</TableHead>
                        <TableHead className="text-center">UL</TableHead>
                        <TableHead className="text-center">A</TableHead>
                        <TableHead className="text-center">OT</TableHead>
                        <TableHead className="text-right">Gross (₹)</TableHead>
                        <TableHead className="text-right">OT (₹)</TableHead>
                        <TableHead className="text-right">Ded (₹)</TableHead>
                        <TableHead className="text-right">Adv (₹)</TableHead>
                        <TableHead className="text-right">Net (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salaryData.rows.map((r) => (
                        <TableRow key={r.worker_id}>
                          <TableCell className="font-mono text-xs">{r.worker_code}</TableCell>
                          <TableCell className="font-medium">
                            {r.name}
                            {r.is_temporary && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">Temp</Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{r.trade ?? '—'}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">{r.site}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{salaryData.days}</TableCell>
                          <TableCell className="text-center text-success">{r.present}</TableCell>
                          <TableCell className="text-center text-warning">{r.half}</TableCell>
                          <TableCell className="text-center text-primary">{r.paid}</TableCell>
                          <TableCell className="text-center text-primary">{r.unpaid}</TableCell>
                          <TableCell className="text-center text-destructive">{r.absent}</TableCell>
                          <TableCell className="text-center">{r.ot}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.gross)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.otAmt)}</TableCell>
                          <TableCell className="text-right text-destructive">{r.ded ? `-${formatCurrency(r.ded)}` : '—'}</TableCell>
                          <TableCell className="text-right text-warning">{r.adv ? `-${formatCurrency(r.adv)}` : '—'}</TableCell>
                          <TableCell className="text-right font-semibold text-success">{formatCurrency(r.net)}</TableCell>
                        </TableRow>
                      ))}
                      {salaryData.rows.length > 0 && (
                        <TableRow className="border-t-2 border-border bg-muted/30">
                          <TableCell className="font-semibold" colSpan={4}>TOTAL</TableCell>
                          <TableCell className="text-center text-muted-foreground" colSpan={1}>—</TableCell>
                          <TableCell className="text-center font-semibold text-success">{salaryTotals.present}</TableCell>
                          <TableCell className="text-center font-semibold text-warning">{salaryTotals.half}</TableCell>
                          <TableCell className="text-center font-semibold text-primary">{salaryTotals.paid}</TableCell>
                          <TableCell className="text-center font-semibold text-primary">{salaryTotals.unpaid}</TableCell>
                          <TableCell className="text-center font-semibold text-destructive">{salaryTotals.absent}</TableCell>
                          <TableCell className="text-center font-semibold">{salaryTotals.otHrs}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(salaryTotals.gross)}</TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(salaryTotals.otAmt)}</TableCell>
                          <TableCell className="text-right font-semibold text-destructive">-{formatCurrency(salaryTotals.ded)}</TableCell>
                          <TableCell className="text-right font-semibold text-warning">-{formatCurrency(salaryTotals.adv)}</TableCell>
                          <TableCell className="text-right font-semibold text-success">{formatCurrency(salaryTotals.payroll)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    P = Present, H = Half Day, PL = Paid Leave, UL = Unpaid Leave, A = Absent, OT = Overtime (hrs).
                    Gross = daily wage × (Present + ½ Half Day + Paid Leave). Net = Gross + OT − Deductions − Monthly Approved Advances.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Attendance */}
        <TabsContent value="monthly-attendance">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Monthly Attendance Report</CardTitle>
                <Button size="sm" onClick={() => exportToExcel('monthly-attendance')} disabled={exporting === 'monthly-attendance' || !monthlyData?.length}>
                  {exporting === 'monthly-attendance' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {sites?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Worker</Label>
                  <Select value={workerId} onValueChange={setWorkerId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Workers</SelectItem>
                      {workers?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Shift</Label>
                  <Select value={shift} onValueChange={setShift}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shifts</SelectItem>
                      <SelectItem value="Day">Day</SelectItem>
                      <SelectItem value="Night">Night</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stats */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                <StatBox label="Present" value={monthlyStats.present} color="text-success" />
                <StatBox label="Absent" value={monthlyStats.absent} color="text-destructive" />
                <StatBox label="Half Day" value={monthlyStats.halfDay} color="text-warning" />
                <StatBox label="Paid Leave" value={monthlyStats.paidLeave} color="text-primary" />
                <StatBox label="Unpaid Leave" value={monthlyStats.unpaidLeave} color="text-primary" />
                <StatBox label="OT (hrs)" value={monthlyStats.ot} color="text-accent" />
                <StatBox label="Attendance %" value={`${monthlyStats.percentage}%`} color="text-foreground" />
                <StatBox label="Total Records" value={monthlyStats.total} color="text-foreground" />
              </div>

              {monthlyLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !monthlyData?.length ? (
                <EmptyState icon={FileBarChart} title="No data" description="No attendance records found for the selected filters." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Worker</TableHead>
                        <TableHead className="hidden md:table-cell">Site</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-center">OT (hrs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyData.slice(0, 50).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{formatDate(r.attendance_date)}</TableCell>
                          <TableCell className="font-medium">{r.worker?.name}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{r.site?.site_name ?? '—'}</TableCell>
                          <TableCell className="text-sm">{r.shift}</TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-center text-sm">{r.overtime ?? 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {monthlyData.length > 50 && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                      Showing 50 of {monthlyData.length} records. Export to see all.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Worker Advance */}
        <TabsContent value="worker-advance">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Worker Advance Report</CardTitle>
                <Button size="sm" onClick={() => exportToExcel('worker-advance')} disabled={exporting === 'worker-advance' || !advanceData?.length}>
                  {exporting === 'worker-advance' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label>From Date</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To Date</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {sites?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={advanceStatus} onValueChange={setAdvanceStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBox label="Total" value={advanceStats.total} color="text-foreground" />
                <StatBox label="Approved" value={advanceStats.approved} color="text-success" />
                <StatBox label="Pending" value={advanceStats.pending} color="text-warning" />
                <StatBox label="Approved Amount" value={formatCurrency(advanceStats.amount)} color="text-accent" />
              </div>

              {advanceLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !advanceData?.length ? (
                <EmptyState icon={Wallet} title="No data" description="No advance records found for the selected filters." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Worker</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead className="hidden md:table-cell">Reason</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {advanceData.slice(0, 50).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{formatDate(r.request_date)}</TableCell>
                          <TableCell className="font-medium">{r.worker?.name}</TableCell>
                          <TableCell>{formatCurrency(r.amount)}</TableCell>
                          <TableCell className="hidden max-w-xs truncate md:table-cell text-muted-foreground">{r.reason ?? '—'}</TableCell>
                          <TableCell><StatusBadge status={r.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Site Attendance */}
        <TabsContent value="site-attendance">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" onClick={() => exportToExcel('site-attendance')} disabled={exporting === 'site-attendance' || !siteAttendanceData?.length}>
                  {exporting === 'site-attendance' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {siteAttendanceLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !siteAttendanceData?.length || siteAttendanceData.every((s) => s.total === 0) ? (
                <EmptyState icon={MapPin} title="No data" description="No attendance records found for this month." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">Half Day</TableHead>
                        <TableHead className="text-center">Paid Leave</TableHead>
                        <TableHead className="text-center">Unpaid Leave</TableHead>
                        <TableHead className="text-center">OT (hrs)</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteAttendanceData.map((s, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{s.site}</TableCell>
                          <TableCell className="text-center text-success">{s.present}</TableCell>
                          <TableCell className="text-center text-destructive">{s.absent}</TableCell>
                          <TableCell className="text-center text-warning">{s.halfDay}</TableCell>
                          <TableCell className="text-center text-primary">{s.paid}</TableCell>
                          <TableCell className="text-center text-primary">{s.unpaid}</TableCell>
                          <TableCell className="text-center">{s.ot}</TableCell>
                          <TableCell className="text-center font-medium">{s.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Worker Summary */}
        <TabsContent value="worker-summary">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <Label>Site</Label>
                  <Select value={siteId} onValueChange={setSiteId}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sites</SelectItem>
                      {sites?.map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {workerSummaryLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : !workerSummaryData?.length ? (
                <EmptyState icon={Users} title="No data" description="No workers found for the selected site." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="hidden md:table-cell">Role</TableHead>
                        <TableHead className="hidden lg:table-cell">Site</TableHead>
                        <TableHead className="text-center">Present</TableHead>
                        <TableHead className="text-center">Absent</TableHead>
                        <TableHead className="text-center">Adv. Balance</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workerSummaryData.map((w, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{w.worker_code}</TableCell>
                          <TableCell className="font-medium">{w.name}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">{w.trade}</TableCell>
                          <TableCell className="hidden lg:table-cell text-muted-foreground">{w.site}</TableCell>
                          <TableCell className="text-center text-success">{w.present}</TableCell>
                          <TableCell className="text-center text-destructive">{w.absent}</TableCell>
                          <TableCell className="text-center font-medium">{formatCurrency(w.advanceBalance)}</TableCell>
                          <TableCell><StatusBadge status={w.status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getFileName(type: ReportType): string {
  const d = new Date().toISOString().split('T')[0];
  switch (type) {
    case 'salary-sheet': return `salary-sheet-${d}.xlsx`;
    case 'monthly-attendance': return `monthly-attendance-${d}.xlsx`;
    case 'worker-advance': return `worker-advance-report-${d}.xlsx`;
    case 'site-attendance': return `site-attendance-${d}.xlsx`;
  }
}

function getReportLabel(type: ReportType): string {
  switch (type) {
    case 'salary-sheet': return 'Salary Sheet';
    case 'monthly-attendance': return 'Monthly Attendance';
    case 'worker-advance': return 'Worker Advance';
    case 'site-attendance': return 'Site Attendance';
  }
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}