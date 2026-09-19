'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Briefcase,
  CalendarCheck,
  Wallet,
  Phone,
  MapPin,
  CreditCard,
  HardHat,
  Calendar,
  Loader2,
  Pencil,
  UserCheck,
  Landmark,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { StatCard } from '@/components/layout/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate, initials } from '@/lib/utils';

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workerId = params.id as string;

  const [converting, setConverting] = useState(false);

  const handleConvertToFullTime = async () => {
    if (!worker) return;
    setConverting(true);
    try {
      const { error } = await supabase
        .from('workers')
        .update({ is_temporary: false })
        .eq('id', worker.id);
      if (error) throw error;
      toast({
        title: 'Worker converted',
        description: `${worker.name} is now a full-time worker and will be included in the salary sheet.`,
      });
      queryClient.invalidateQueries({ queryKey: ['worker', workerId] });
      queryClient.invalidateQueries({ queryKey: ['workers'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Conversion failed', description: message });
    }
    setConverting(false);
  };

  const { data: worker, isLoading } = useQuery({
    queryKey: ['worker', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select(`
          *,
          site:sites(id, site_name, site_code)
        `)
        .eq('id', workerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!workerId,
  });

  const { data: attendanceHistory } = useQuery({
    queryKey: ['worker-attendance', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          id, status, attendance_date, shift,
          site:sites(site_name)
        `)
        .eq('worker_id', workerId)
        .order('attendance_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workerId,
  });

  const { data: advanceHistory } = useQuery({
    queryKey: ['worker-advances', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_advances')
        .select(`
          id, amount, status, request_date, reason, remarks,
          approved_by_profile:profiles!salary_advances_approved_by_fkey(full_name)
        `)
        .eq('worker_id', workerId)
        .order('request_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!workerId,
  });

  const advanceBalance = ((advanceHistory as { status: string; amount: number }[]) ?? [])
    .filter((a) => a.status === 'Approved')
    .reduce((sum: number, a) => sum + Number(a.amount), 0);

  const attendanceStats = ((attendanceHistory as { status: string }[]) ?? []).reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div>
        <PageHeader title="Worker Not Found" />
        <EmptyState
          icon={User}
          title="Worker not found"
          description="This worker may have been removed."
          action={<Button onClick={() => router.push('/workers')}>Back to Workers</Button>}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/workers')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workers
        </Button>
      </div>

      <PageHeader title={worker.name} description={`${worker.worker_code} · ${worker.trade ?? '—'}`}>
        {role === 'admin' && worker.is_temporary && (
          <Button onClick={handleConvertToFullTime} disabled={converting}>
            {converting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserCheck className="mr-2 h-4 w-4" />}
            Convert to Full-time
          </Button>
        )}
        {role === 'admin' && (
          <Button asChild variant="outline">
            <Link href="/workers">Edit Worker</Link>
          </Button>
        )}
      </PageHeader>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Advance Balance"
          value={formatCurrency(advanceBalance)}
          icon={Wallet}
          iconColor="text-accent"
          iconBg="bg-accent/10"
        />
        <StatCard
          label="Total Attendance"
          value={(attendanceHistory ?? []).length}
          icon={CalendarCheck}
        />
        <StatCard
          label="Present Days"
          value={attendanceStats['Present'] ?? 0}
          icon={CalendarCheck}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <StatCard
          label="Advance Count"
          value={(advanceHistory ?? []).length}
          icon={Wallet}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Personal Information */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                {worker.photo_url ? (
                  <AvatarImage src={worker.photo_url} alt={worker.name} />
                ) : null}
                <AvatarFallback className="text-lg">{initials(worker.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{worker.name}</p>
                <StatusBadge status={worker.status} />
                {worker.is_temporary && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    Temporary
                  </Badge>
                )}
              </div>
            </div>
            <InfoRow icon={Phone} label="Mobile" value={worker.mobile} />
            <InfoRow icon={MapPin} label="Address" value={worker.address} />
            <InfoRow icon={CreditCard} label="Aadhaar" value={worker.aadhaar} />
          </CardContent>
        </Card>

        {/* Employment Information */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="h-4 w-4 text-primary" />
              Employment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={HardHat} label="Role" value={worker.trade} />
            <InfoRow icon={Wallet} label="Daily Wage" value={worker.daily_wage ? formatCurrency(worker.daily_wage) : null} />
            <InfoRow icon={Wallet} label="PF (%)" value={worker.pf_percentage != null ? `${worker.pf_percentage}%` : null} />
            <InfoRow icon={Calendar} label="Joining Date" value={formatDate(worker.joining_date)} />
            <InfoRow icon={MapPin} label="Current Site" value={worker.site?.site_name} />
            <InfoRow icon={MapPin} label="Working Place" value={worker.working_place} />
            <InfoRow icon={Briefcase} label="Type of Work" value={worker.work_type} />
            <InfoRow icon={Calendar} label="Working Since" value={formatDate(worker.working_since)} />
          </CardContent>
        </Card>

        {/* Bank Information */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" />
              Bank Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow icon={Landmark} label="Bank Name" value={worker.bank_name} />
            <InfoRow icon={Wallet} label="Account Number" value={worker.account_number} />
            <InfoRow icon={Wallet} label="IFSC Code" value={worker.ifsc} />
            <InfoRow icon={MapPin} label="Branch" value={worker.branch} />
          </CardContent>
        </Card>
      </div>

      {/* Attendance History */}
      <Card className="mt-6 border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Attendance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {attendanceHistory && attendanceHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead className="hidden md:table-cell">Site</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceHistory.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>{formatDate(rec.attendance_date)}</TableCell>
                    <TableCell>{rec.shift}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {rec.site?.site_name ?? '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={rec.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={CalendarCheck} title="No attendance records" className="py-6" />
          )}
        </CardContent>
      </Card>

      {/* Salary Advance History */}
      <Card className="mt-6 border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" />
            Salary Advance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {advanceHistory && advanceHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Reason</TableHead>
                  <TableHead className="hidden lg:table-cell">Approved By</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advanceHistory.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell>{formatDate(rec.request_date)}</TableCell>
                    <TableCell className="font-medium">{formatCurrency(rec.amount)}</TableCell>
                    <TableCell className="hidden md:table-cell max-w-xs truncate text-muted-foreground">
                      {rec.reason ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {rec.approved_by_profile?.full_name ?? '—'}
                    </TableCell>
                    <TableCell><StatusBadge status={rec.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={Wallet} title="No advance records" className="py-6" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || '—'}</p>
      </div>
    </div>
  );
}
