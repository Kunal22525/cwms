'use client';

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
  TrendingUp,
  AlertCircle,
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
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

const CHART_COLORS = [
  'hsl(213 94% 56%)',
  'hsl(24 95% 53%)',
  'hsl(142 71% 45%)',
  'hsl(0 72% 51%)',
  'hsl(280 65% 60%)',
];

export default function DashboardPage() {
  const { role, user } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      let siteFilter: string | null = null;
      if (role !== 'admin') {
        const { data: siteData } = await supabase
          .from('sites')
          .select('id')
          .eq('supervisor_id', user?.id)
          .maybeSingle();
        siteFilter = siteData?.id ?? null;
      }

      const [workersRes, sitesRes, attendanceRes, advancesRes] = await Promise.all([
        supabase.from('workers').select('id', { count: 'exact', head: true }),
        supabase.from('sites').select('id', { count: 'exact', head: true }),
        supabase
          .from('attendance')
          .select('status')
          .eq('attendance_date', today),
        supabase
          .from('salary_advances')
          .select('status, amount')
          .eq('status', 'Pending'),
      ]);

      const todayAttendance = (attendanceRes.data as { status: string }[]) ?? [];
      const presentToday = todayAttendance.filter((a: { status: string }) => a.status === 'Present').length;
      const absentToday = todayAttendance.filter((a: { status: string }) => a.status === 'Absent').length;
      const halfDayToday = todayAttendance.filter((a: { status: string }) => a.status === 'Half Day').length;

      return {
        totalWorkers: workersRes.count ?? 0,
        activeSites: sitesRes.count ?? 0,
        presentToday,
        absentToday,
        halfDayToday,
        pendingAdvances: advancesRes.data?.length ?? 0,
        siteFilter,
      };
    },
    enabled: !!user,
  });

  const { data: attendanceTrend } = useQuery({
    queryKey: ['attendance-trend'],
    queryFn: async () => {
      const days: { date: string; label: string; Present: number; Absent: number; 'Half Day': number }[] = [];
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
          label: d.toLocaleDateString('en-US', { weekday: 'short' }),
          Present: statuses.filter((s: { status: string }) => s.status === 'Present').length,
          Absent: statuses.filter((s: { status: string }) => s.status === 'Absent').length,
          'Half Day': statuses.filter((s: { status: string }) => s.status === 'Half Day').length,
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

  const { data: attendanceDistribution } = useQuery({
    queryKey: ['attendance-distribution'],
    queryFn: async () => {
      const { data } = await supabase
        .from('attendance')
        .select('status')
        .order('created_at', { ascending: false })
        .limit(500);
      const statuses = (data as { status: string }[]) ?? [];
      return [
        { name: 'Present', value: statuses.filter((s: { status: string }) => s.status === 'Present').length },
        { name: 'Absent', value: statuses.filter((s: { status: string }) => s.status === 'Absent').length },
        { name: 'Half Day', value: statuses.filter((s: { status: string }) => s.status === 'Half Day').length },
        { name: 'Leave', value: statuses.filter((s: { status: string }) => s.status === 'Leave').length },
      ].filter((s) => s.value > 0);
    },
    enabled: !!user,
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

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Overview of your construction operations" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your construction operations" />

      {/* Stat Cards */}
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

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Attendance Trend */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              Attendance Trend (7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceTrend && attendanceTrend.some((d) => d.Present > 0 || d.Absent > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={attendanceTrend}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 19% 17%)" />
                  <XAxis dataKey="label" stroke="hsl(215 16% 60%)" fontSize={12} />
                  <YAxis stroke="hsl(215 16% 60%)" fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(222 18% 10%)',
                      border: '1px solid hsl(217 19% 17%)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="Present" stroke={CHART_COLORS[2]} fillOpacity={1} fill="url(#colorPresent)" />
                  <Area type="monotone" dataKey="Absent" stroke={CHART_COLORS[3]} fillOpacity={1} fill="url(#colorAbsent)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={TrendingUp} title="No attendance data" description="Attendance will appear here once records are added." className="py-8" />
            )}
          </CardContent>
        </Card>

        {/* Attendance Distribution */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Attendance Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {attendanceDistribution && attendanceDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={attendanceDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {attendanceDistribution.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(222 18% 10%)',
                      border: '1px solid hsl(217 19% 17%)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={AlertCircle} title="No data" description="Attendance distribution will appear here." className="py-8" />
            )}
          </CardContent>
        </Card>

        {/* Site-wise Worker Count */}
        {role === 'admin' && (
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Site-wise Worker Count</CardTitle>
            </CardHeader>
            <CardContent>
              {siteWorkerCounts && siteWorkerCounts.some((s) => s.workers > 0) ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={siteWorkerCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 19% 17%)" />
                    <XAxis dataKey="name" stroke="hsl(215 16% 60%)" fontSize={11} />
                    <YAxis stroke="hsl(215 16% 60%)" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(222 18% 10%)',
                        border: '1px solid hsl(217 19% 17%)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="workers" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={MapPin} title="No sites" description="Add sites and assign workers to see data here." className="py-8" />
              )}
            </CardContent>
          </Card>
        )}

        {/* Salary Advance Summary */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Salary Advance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {advanceSummary && advanceSummary.some((a) => a.amount > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={advanceSummary} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 19% 17%)" />
                  <XAxis type="number" stroke="hsl(215 16% 60%)" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="hsl(215 16% 60%)" fontSize={12} width={70} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(222 18% 10%)',
                      border: '1px solid hsl(217 19% 17%)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Wallet} title="No advances" description="Salary advance data will appear here." className="py-8" />
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
