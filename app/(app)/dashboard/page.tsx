'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Users,
  MapPin,
  CalendarCheck,
  CalendarX,
  Clock,
  Wallet,
  UserPlus,
  CalendarPlus,
  MapPinPlus,
  FilePlus,
  FileText,
  FileWarning,
  FileX2,
  CalendarDays,
  Check,
  Minus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/layout/stat-card';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function DashboardPage() {
  const { role, user } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const monthPrefix = today.slice(0, 7);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split('T')[0];

      const [workersRes, sitesRes, attendanceRes, advancesRes] = await Promise.all([
        supabase.from('workers').select('id', { count: 'exact', head: true }),
        supabase.from('sites').select('id', { count: 'exact', head: true }),
        supabase
          .from('attendance')
          .select('status, overtime')
          .eq('attendance_date', todayStr),
        supabase
          .from('salary_advances')
          .select('status, amount')
          .eq('status', 'Pending'),
      ]);

      const todayAttendance = (attendanceRes.data as { status: string; overtime: number | null }[]) ?? [];
      const presentToday = todayAttendance.filter((a: { status: string }) => a.status === 'Present').length;
      const absentToday = todayAttendance.filter((a: { status: string }) => a.status === 'Absent').length;
      const halfDayToday = todayAttendance.filter((a: { status: string }) => a.status === 'Half Day').length;
      const leaveToday = todayAttendance.filter((a: { status: string }) => a.status === 'Leave').length;
      const otToday = todayAttendance.reduce((s: number, a: { status: string; overtime: number | null }) => s + (a.overtime ?? 0), 0);

      return {
        totalWorkers: workersRes.count ?? 0,
        activeSites: sitesRes.count ?? 0,
        presentToday,
        absentToday,
        halfDayToday,
        leaveToday,
        otToday,
        pendingAdvances: advancesRes.data?.length ?? 0,
      };
    },
    enabled: !!user,
  });

  const { data: monthStats } = useQuery({
    queryKey: ['month-attendance-stats', monthPrefix],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select('status, overtime, deduction, leave_type')
        .gte('attendance_date', `${monthPrefix}-01`)
        .lte('attendance_date', today);
      const rows = (data as { status: string; overtime: number | null; deduction: number | null; leave_type: string | null }[]) ?? [];
      return {
        present: rows.filter((r) => r.status === 'Present').length,
        absent: rows.filter((r) => r.status === 'Absent').length,
        halfDay: rows.filter((r) => r.status === 'Half Day').length,
        paidLeave: rows.filter((r) => r.status === 'Leave' && r.leave_type === 'Paid').length,
        unpaidLeave: rows.filter((r) => r.status === 'Leave' && r.leave_type !== 'Paid').length,
        overtime: rows.reduce((s, r) => s + (r.overtime ?? 0), 0),
        deductions: rows.reduce((s, r) => s + (r.deduction ?? 0), 0),
      };
    },
    enabled: !!user,
  });

  const { data: weekAttendance } = useQuery({
    queryKey: ['week-attendance'],
    queryFn: async () => {
      const days: { date: string; label: string; Present: number; Absent: number; 'Half Day': number; Leave: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const { data } = await supabase
          .from('attendance')
          .select('status')
          .eq('attendance_date', dateStr);
        const statuses = (data as { status: string }[]) ?? [];
        days.push({
          date: dateStr,
          label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }),
          Present: statuses.filter((s: { status: string }) => s.status === 'Present').length,
          Absent: statuses.filter((s: { status: string }) => s.status === 'Absent').length,
          'Half Day': statuses.filter((s: { status: string }) => s.status === 'Half Day').length,
          Leave: statuses.filter((s: { status: string }) => s.status === 'Leave').length,
        });
      }
      return days;
    },
    enabled: !!user,
  });

  const { data: siteWorkerCounts } = useQuery({
    queryKey: ['site-worker-counts'],
    queryFn: async () => {
      const { data: sites } = await supabase
        .from('sites')
        .select('id, site_name')
        .eq('status', 'Active');
      if (!sites?.length) return [];

      const result: { name: string; workers: number }[] = [];
      for (const site of sites as { id: string; site_name: string }[]) {
        const { count } = await supabase
          .from('workers')
          .select('id', { count: 'exact', head: true })
          .eq('site_id', site.id)
          .eq('status', 'Active');
        result.push({ name: site.site_name, workers: count ?? 0 });
      }
      return result;
    },
    enabled: !!user && role === 'admin',
  });

  const { data: advanceSummary } = useQuery({
    queryKey: ['advance-summary'],
    queryFn: async () => {
      const { data } = await supabase
        .from('salary_advances')
        .select('status, amount');
      const advances = (data as { status: string; amount: number }[]) ?? [];
      return [
        { name: 'Pending', amount: advances.filter((a: { status: string; amount: number }) => a.status === 'Pending').reduce((s: number, a: { status: string; amount: number }) => s + Number(a.amount), 0) },
        { name: 'Approved', amount: advances.filter((a: { status: string; amount: number }) => a.status === 'Approved').reduce((s: number, a: { status: string; amount: number }) => s + Number(a.amount), 0) },
        { name: 'Rejected', amount: advances.filter((a: { status: string; amount: number }) => a.status === 'Rejected').reduce((s: number, a: { status: string; amount: number }) => s + Number(a.amount), 0) },
      ];
    },
    enabled: !!user,
  });

  const { data: recentAttendance } = useQuery({
    queryKey: ['recent-attendance'],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select(`
          id, status, attendance_date, shift,
          worker:workers(worker_code, name),
          site:sites(site_name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: recentAdvances } = useQuery({
    queryKey: ['recent-advances'],
    queryFn: async () => {
      const { data } = await supabase
        .from('salary_advances')
        .select(`
          id, amount, status, request_date,
          worker:workers(worker_code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: recentWorkers } = useQuery({
    queryKey: ['recent-workers'],
    queryFn: async () => {
      const { data } = await supabase
        .from('workers')
        .select('id, worker_code, name, trade, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: documentAlerts } = useQuery({
    queryKey: ['document-expiry-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, title, file_name, expiry_date, remind_me, reminder_days');
      return (data as {
        id: string;
        title: string;
        file_name: string | null;
        expiry_date: string;
        remind_me: boolean;
        reminder_days: number;
      }[]) ?? [];
    },
    enabled: !!user,
  });

  const docAlerts = useMemo(() => {
    if (!documentAlerts?.length) return { expired: [] as { id: string; title: string; days: number }[], expiring: [] as { id: string; title: string; days: number }[] };
    const todayMs = new Date().setHours(0, 0, 0, 0);
    const expired: { id: string; title: string; days: number }[] = [];
    const expiring: { id: string; title: string; days: number }[] = [];
    documentAlerts.forEach((doc) => {
      const exp = new Date(doc.expiry_date);
      exp.setHours(0, 0, 0, 0);
      const days = Math.round((exp.getTime() - todayMs) / 86400000);
      if (days < 0) expired.push({ id: doc.id, title: doc.title, days: Math.abs(days) });
      else if (doc.remind_me && days <= doc.reminder_days)
        expiring.push({ id: doc.id, title: doc.title, days });
    });
    return { expired, expiring };
  }, [documentAlerts]);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Overview of your construction operations" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  const kpiRow = (label: string, value: number | string, colorClass = 'text-foreground') => (
    <div className="rounded-lg border border-border/60 bg-card p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your construction operations" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Workers" value={stats?.totalWorkers ?? 0} icon={Users} />
        <StatCard label="Active Sites" value={stats?.activeSites ?? 0} icon={MapPin} iconColor="text-accent" iconBg="bg-accent/10" />
        <StatCard label="Present Today" value={stats?.presentToday ?? 0} icon={CalendarCheck} iconColor="text-success" iconBg="bg-success/10" />
        <StatCard label="Absent Today" value={stats?.absentToday ?? 0} icon={CalendarX} iconColor="text-destructive" iconBg="bg-destructive/10" />
        <StatCard label="Half Day Today" value={stats?.halfDayToday ?? 0} icon={Clock} iconColor="text-warning" iconBg="bg-warning/10" />
        <StatCard label="Pending Advances" value={stats?.pendingAdvances ?? 0} icon={Wallet} iconColor="text-accent" iconBg="bg-accent/10" />
      </div>

      {/* Quick Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild size="sm">
          <Link href="/workers?action=new">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Worker
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/attendance">
            <CalendarPlus className="mr-2 h-4 w-4" />
            Mark Attendance
          </Link>
        </Button>
        {role === 'admin' && (
          <Button asChild variant="outline" size="sm">
            <Link href="/sites?action=new">
              <MapPinPlus className="mr-2 h-4 w-4" />
              Add Site
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link href="/salary-advances?action=new">
            <FilePlus className="mr-2 h-4 w-4" />
            Request Advance
          </Link>
        </Button>
      </div>

      {/* Document Expiry Reminders */}
      {(docAlerts.expired.length > 0 || docAlerts.expiring.length > 0) && (
        <div className="mt-6 space-y-3">
          {docAlerts.expired.length > 0 && (
            <Link
              href="/documents"
              className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 hover:bg-destructive/10"
            >
              <FileX2 className="h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">
                  {docAlerts.expired.length} expired document{docAlerts.expired.length === 1 ? '' : 's'}
                </p>
                <p className="text-xs text-destructive/80">
                  {docAlerts.expired.map((d) => d.title).join(' · ')}
                </p>
              </div>
            </Link>
          )}
          {docAlerts.expiring.length > 0 && (
            <Link
              href="/documents"
              className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4 hover:bg-warning/10"
            >
              <FileWarning className="h-5 w-5 shrink-0 text-warning" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-warning">
                  {docAlerts.expiring.length} document{docAlerts.expiring.length === 1 ? '' : 's'} expiring soon
                </p>
                <p className="text-xs text-warning/80">
                  {docAlerts.expiring.map((d) => `${d.title} (${d.days}d)`).join(' · ')}
                </p>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Quick action hint */}
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <FileText className="h-4 w-4" />
        Track expiry of licenses and documents in the Documents section.
      </div>

      {/* Attendance Status: Today + Current Month */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="h-4 w-4 text-primary" />
              Today&apos;s Attendance Status
              <span className="text-xs font-normal text-muted-foreground">({formatDate(today)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {kpiRow('Present', stats?.presentToday ?? 0, 'text-success')}
              {kpiRow('Absent', stats?.absentToday ?? 0, 'text-destructive')}
              {kpiRow('Half Day', stats?.halfDayToday ?? 0, 'text-warning')}
              {kpiRow('Leave', stats?.leaveToday ?? 0, 'text-primary')}
              {kpiRow('OT (hrs)', stats?.otToday ?? 0, 'text-accent')}
              {kpiRow('Marked', (stats?.presentToday ?? 0) + (stats?.absentToday ?? 0) + (stats?.halfDayToday ?? 0) + (stats?.leaveToday ?? 0))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" />
              Current Month Attendance
              <span className="text-xs font-normal text-muted-foreground">(since {formatDate(`${monthPrefix}-01`)})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {kpiRow('Present', monthStats?.present ?? 0, 'text-success')}
              {kpiRow('Absent', monthStats?.absent ?? 0, 'text-destructive')}
              {kpiRow('Half Day', monthStats?.halfDay ?? 0, 'text-warning')}
              {kpiRow('Paid Leave', monthStats?.paidLeave ?? 0, 'text-primary')}
              {kpiRow('Unpaid Leave', monthStats?.unpaidLeave ?? 0, 'text-primary')}
              {kpiRow('OT (hrs)', monthStats?.overtime ?? 0, 'text-accent')}
            </div>
            {(monthStats?.present ?? 0) > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Deductions this month: {formatCurrency(monthStats?.deductions ?? 0)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Last 7 Days Status */}
      <Card className="mt-4 border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" />
            Attendance Status – Last 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weekAttendance ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {weekAttendance.map((d) => (
                <div key={d.date} className="rounded-lg border border-border/60 bg-card p-2 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{d.label}</p>
                  <p className="mt-1 text-lg font-bold">{d.Present + d.Absent + d['Half Day'] + d.Leave}</p>
                  <div className="mt-1 flex justify-center gap-1 text-[10px]">
                    <span className="text-success">{d.Present}P</span>
                    <span className="text-destructive">{d.Absent}A</span>
                    <span className="text-warning">{d['Half Day']}H</span>
                    <span className="text-primary">{d.Leave}L</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Check} title="No attendance data" className="py-6" />
          )}
        </CardContent>
      </Card>

      {/* KPI Summary: Sites & Advances */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {role === 'admin' && (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4 text-primary" />
                Site-wise Worker Count
              </CardTitle>
            </CardHeader>
            <CardContent>
              {siteWorkerCounts && siteWorkerCounts.some((s) => s.workers > 0) ? (
                <div className="space-y-2">
                  {siteWorkerCounts.map((s) => (
                    <div key={s.name} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                      <span className="truncate text-sm">{s.name}</span>
                      <span className="font-semibold">{s.workers} worker{s.workers === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={MapPin} title="No sites" description="Add sites and assign workers to see data here." className="py-6" />
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Salary Advance Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {advanceSummary && advanceSummary.some((a) => a.amount > 0) ? (
              <div className="space-y-2">
                {advanceSummary.map((a) => (
                  <div key={a.name} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-sm">{a.name}</span>
                    <span className="font-semibold">{formatCurrency(a.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Minus} title="No advances" description="Salary advance data will appear here." className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent Attendance */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Recent Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAttendance && recentAttendance.length > 0 ? (
              <div className="space-y-3">
                {recentAttendance.map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {rec.worker?.name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rec.site?.site_name ?? '—'} · {formatDate(rec.attendance_date)}
                      </p>
                    </div>
                    <StatusBadge status={rec.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={CalendarCheck} title="No attendance yet" className="py-6" />
            )}
          </CardContent>
        </Card>

        {/* Recent Advances */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Recent Salary Advances</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAdvances && recentAdvances.length > 0 ? (
              <div className="space-y-3">
                {recentAdvances.map((rec) => (
                  <div key={rec.id} className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {rec.worker?.name ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(rec.amount)} · {formatDate(rec.request_date)}
                      </p>
                    </div>
                    <StatusBadge status={rec.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Wallet} title="No advances yet" className="py-6" />
            )}
          </CardContent>
        </Card>

        {/* Recent Workers */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Recently Added Workers</CardTitle>
          </CardHeader>
          <CardContent>
            {recentWorkers && recentWorkers.length > 0 ? (
              <div className="space-y-3">
                {recentWorkers.map((rec) => (
                  <Link
                    key={rec.id}
                    href={`/workers/${rec.id}`}
                    className="flex items-center justify-between hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{rec.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {rec.worker_code} · {rec.trade ?? '—'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(rec.created_at)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={UserPlus} title="No workers yet" className="py-6" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}