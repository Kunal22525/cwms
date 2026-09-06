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
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { StatusBadge } from '@/components/layout/status-badge';
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

type ReportType = 'monthly-attendance' | 'worker-advance' | 'site-attendance' | 'worker-summary';

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
          id, status, attendance_date, shift,
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
      return (data as unknown as { id: string; status: string; attendance_date: string; shift: string; worker: { id: string; worker_code: string; name: string; trade: string } | null; site: { id: string; site_name: string } | null }[]) ?? [];
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

      const results: { site: string; site_code: string; present: number; absent: number; halfDay: number; leave: number; total: number }[] = [];

      for (const site of (sitesData as { id: string; site_name: string; site_code: string }[]) ?? []) {
        const { data } = await supabase
          .from('attendance')
          .select('status')
          .eq('site_id', site.id)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate);

        const records = (data as { status: string }[]) ?? [];
        results.push({
          site: site.site_name,
          site_code: site.site_code,
          present: records.filter((r) => r.status === 'Present').length,
          absent: records.filter((r) => r.status === 'Absent').length,
          halfDay: records.filter((r) => r.status === 'Half Day').length,
          leave: records.filter((r) => r.status === 'Leave').length,
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

  const monthlyStats = useMemo(() => {
    if (!monthlyData) return { present: 0, absent: 0, halfDay: 0, leave: 0, total: 0, percentage: 0 };
    const present = monthlyData.filter((r) => r.status === 'Present').length;
    const absent = monthlyData.filter((r) => r.status === 'Absent').length;
    const halfDay = monthlyData.filter((r) => r.status === 'Half Day').length;
    const leave = monthlyData.filter((r) => r.status === 'Leave').length;
    const total = monthlyData.length;
    const percentage = total > 0 ? Math.round(((present + halfDay * 0.5) / total) * 100) : 0;
    return { present, absent, halfDay, leave, total, percentage };
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
    try {
      const wb = XLSX.utils.book_new();
      const genDate = new Date().toLocaleString();

      if (type === 'monthly-attendance') {
        const rows = (monthlyData ?? []).map((r) => ({
          Date: formatDate(r.attendance_date),
          Worker: r.worker?.name ?? '',
          Code: r.worker?.worker_code ?? '',
          Trade: r.worker?.trade ?? '',
          Site: r.site?.site_name ?? '',
          Shift: r.shift,
          Status: r.status,
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { origin: 'A3' } as never);
        XLSX.utils.sheet_add_aoa(ws, [['Monthly Attendance Report'], [`Generated: ${genDate}`]], { origin: 'A1' });
        XLSX.utils.book_append_sheet(wb, ws, 'Monthly Attendance');
        const fileName = `monthly-attendance-${month}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
        await logReport('Monthly Attendance', fileName);
      } else if (type === 'worker-advance') {
        const rows = (advanceData ?? []).map((r) => ({
          Date: formatDate(r.request_date),
          Worker: r.worker?.name ?? '',
          Code: r.worker?.worker_code ?? '',
          Amount: Number(r.amount),
          Status: r.status,
          Reason: r.reason ?? '',
          ApprovedBy: r.approved_by_profile?.full_name ?? '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { origin: 'A3' } as never);
        XLSX.utils.sheet_add_aoa(ws, [['Worker Advance Report'], [`Generated: ${genDate}`]], { origin: 'A1' });
        XLSX.utils.book_append_sheet(wb, ws, 'Worker Advances');
        const fileName = `worker-advance-report-${new Date().toISOString().split('T')[0]}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
        await logReport('Worker Advance', fileName);
      } else if (type === 'site-attendance') {
        const rows = (siteAttendanceData ?? []).map((r) => ({
          Site: r.site,
          Code: r.site_code,
          Present: r.present,
          Absent: r.absent,
          'Half Day': r.halfDay,
          Leave: r.leave,
          Total: r.total,
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { origin: 'A3' } as never);
        XLSX.utils.sheet_add_aoa(ws, [['Site-wise Attendance Report'], [`Generated: ${genDate}`]], { origin: 'A1' });
        XLSX.utils.book_append_sheet(wb, ws, 'Site Attendance');
        const fileName = `site-attendance-${month}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
        await logReport('Site Attendance', fileName);
      } else if (type === 'worker-summary') {
        const rows = (workerSummaryData ?? []).map((r) => ({
          Code: r.worker_code,
          Name: r.name,
          Trade: r.trade,
          Site: r.site,
          'Daily Wage': r.daily_wage ?? 0,
          'Joining Date': r.joining_date ? formatDate(r.joining_date) : '',
          Status: r.status,
          'Working Place': r.working_place ?? '',
          'Work Type': r.work_type ?? '',
          'Working Since': r.working_since ? formatDate(r.working_since) : '',
          Present: r.present,
          Absent: r.absent,
          'Half Day': r.halfDay,
          Leave: r.leave,
          'Advance Balance': r.advanceBalance,
          'Advance Count': r.advanceCount,
        }));
        const ws = XLSX.utils.json_to_sheet(rows, { origin: 'A3' } as never);
        XLSX.utils.sheet_add_aoa(ws, [['Worker Summary Report'], [`Generated: ${genDate}`]], { origin: 'A1' });
        XLSX.utils.book_append_sheet(wb, ws, 'Worker Summary');
        const fileName = `worker-summary-${new Date().toISOString().split('T')[0]}.xlsx`;
        const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
        await logReport('Worker Summary', fileName);
      }

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

      <Tabs defaultValue="monthly-attendance">
        <TabsList className="mb-4 flex flex-wrap">
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
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <StatBox label="Present" value={monthlyStats.present} color="text-success" />
                <StatBox label="Absent" value={monthlyStats.absent} color="text-destructive" />
                <StatBox label="Half Day" value={monthlyStats.halfDay} color="text-warning" />
                <StatBox label="Leave" value={monthlyStats.leave} color="text-primary" />
                <StatBox label="Attendance %" value={`${monthlyStats.percentage}%`} color="text-foreground" />
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
                        <TableHead className="text-center">Leave</TableHead>
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
                          <TableCell className="text-center text-primary">{s.leave}</TableCell>
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
                <Button size="sm" onClick={() => exportToExcel('worker-summary')} disabled={exporting === 'worker-summary' || !workerSummaryData?.length}>
                  {exporting === 'worker-summary' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export Excel
                </Button>
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
                        <TableHead className="hidden md:table-cell">Trade</TableHead>
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

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
