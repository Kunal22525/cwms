'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Wallet,
  Plus,
  HandCoins,
  Loader2,
  Check,
  X,
  Search,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { StatCard } from '@/components/layout/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { salaryAdvanceSchema, salaryPaymentSchema, type SalaryAdvanceFormValues, type SalaryPaymentFormValues } from '@/lib/validations';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SalaryAdvance, SalaryPayment, Worker, Site } from '@/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function lastMonth(): string {
  const d = new Date();
  const lm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}`;
}

type SalaryCalc = {
  loading: boolean;
  daysPaid: number;
  gross: number;
  otAmt: number;
  pf: number;
  ded: number;
  monthly: number;
  total: number;
  netDue: number;
  paidOnSite: number;
  paidOffice: number;
  paid: number;
  remaining: number;
  note: string | null;
};

export default function SalaryAdvancesPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [actionAdvance, setActionAdvance] = useState<{ advance: SalaryAdvance; action: 'approve' | 'reject' } | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<SalaryAdvanceFormValues>({
    worker_id: '',
    amount: 0,
    request_date: new Date().toISOString().split('T')[0],
    reason: '',
    remarks: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [paymentForm, setPaymentForm] = useState<SalaryPaymentFormValues>({
    worker_id: '',
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    payment_location: 'On Site',
    remarks: '',
  });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});
  const [paymentToDelete, setPaymentToDelete] = useState<SalaryPayment | null>(null);
  const [releaseMonth, setReleaseMonth] = useState(lastMonth());
  const [salaryCalc, setSalaryCalc] = useState<SalaryCalc | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_name, status')
        .order('site_name');
      if (error) throw error;
      return (data as Site[]) ?? [];
    },
  });

  const { data: advances, isLoading } = useQuery({
    queryKey: ['salary-advances', statusFilter, search],
    queryFn: async () => {
      let query = supabase
        .from('salary_advances')
        .select(`
          *,
          worker:workers(id, worker_code, name, trade),
          requested_by_profile:profiles!salary_advances_requested_by_fkey(id, full_name),
          approved_by_profile:profiles!salary_advances_approved_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (search) {
        query = query.or(`reason.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as SalaryAdvance[]) ?? [];
    },
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['salary-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salary_payments')
        .select(`
          *,
          worker:workers(id, worker_code, name, trade, site_id),
          site:sites(id, site_name)
        `)
        .order('payment_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as SalaryPayment[]) ?? [];
    },
  });

  const paymentsStats = useMemo(() => {
    if (!payments) return { count: 0, total: 0, onSite: 0, inOffice: 0 };
    return {
      count: payments.length,
      total: payments.reduce((s, p) => s + Number(p.amount), 0),
      onSite: payments.filter((p) => p.payment_location === 'On Site').reduce((s, p) => s + Number(p.amount), 0),
      inOffice: payments.filter((p) => p.payment_location === 'In Office').reduce((s, p) => s + Number(p.amount), 0),
    };
  }, [payments]);

  const releaseBlocked = !!(salaryCalc && !salaryCalc.loading && salaryCalc.remaining <= 0);

  const { data: workers } = useQuery({
    queryKey: ['workers-for-advance'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, worker_code, name, trade, site_id, status')
        .eq('status', 'Active')
        .order('name');
      if (error) throw error;
      return (data as Worker[]) ?? [];
    },
  });

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      openNewDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    recalcSalary(paymentForm.worker_id, releaseMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentForm.worker_id, releaseMonth]);

  const recalcSalary = async (workerId: string, m: string) => {
    if (!workerId) {
      setSalaryCalc(null);
      return;
    }
    setSalaryCalc({ loading: true, daysPaid: 0, gross: 0, otAmt: 0, pf: 0, ded: 0, monthly: 0, total: 0, netDue: 0, paidOnSite: 0, paidOffice: 0, paid: 0, remaining: 0, note: null });
    try {
      const [y, mo] = m.split('-').map(Number);
      const startDate = `${m}-01`;
      const endDay = new Date(y, mo, 0).getDate();
      const endDate = `${m}-${String(endDay).padStart(2, '0')}`;

      const [wRes, attRes, payRes] = await Promise.all([
        supabase.from('workers').select('daily_wage, pf_percentage').eq('id', workerId).maybeSingle(),
        supabase
          .from('attendance')
          .select('status, overtime, deduction, leave_type')
          .eq('worker_id', workerId)
          .gte('attendance_date', startDate)
          .lte('attendance_date', endDate),
        supabase
          .from('salary_payments')
          .select('amount, payment_location')
          .eq('worker_id', workerId)
          .eq('salary_month', m),
      ]);
      if (attRes.error || payRes.error) throw attRes.error || payRes.error;

      const wage = Number(wRes.data?.daily_wage ?? 0);
      const pfPct = Number(wRes.data?.pf_percentage ?? 12);
      const att = attRes.data ?? [];
      let present = 0, half = 0, paidLeave = 0, otH = 0, ded = 0;
      att.forEach((r) => {
        if (r.status === 'Present') present++;
        else if (r.status === 'Half Day') half++;
        else if (r.status === 'Leave') { if (r.leave_type === 'Paid') paidLeave++; }
        otH += Number(r.overtime ?? 0);
        ded += Number(r.deduction ?? 0);
      });

      const daysPaid = round2(present + half * 0.5 + paidLeave);
      const gross = round2(wage * daysPaid);
      const otAmt = round2(wage > 0 ? (wage / 8) * otH : 0);
      const pf = round2((gross * pfPct) / 100);
      const monthly = round2(wage * 30);
      const total = round2(Math.min(gross, monthly) + otAmt);
      const netDue = round2(total - pf - ded);
      let paidOnSite = 0, paidOffice = 0;
      (payRes.data ?? []).forEach((p) => {
        if (p.payment_location === 'In Office') paidOffice += Number(p.amount);
        else paidOnSite += Number(p.amount);
      });
      paidOnSite = round2(paidOnSite);
      paidOffice = round2(paidOffice);
      const paid = round2(paidOnSite + paidOffice);
      const remaining = round2(netDue - paid);

      let note: string | null = null;
      if (att.length === 0) note = `No attendance records found for this worker in ${monthLabel(m)}.`;
      else if (netDue <= 0) note = 'Nothing is due for this month.';

      setSalaryCalc({ loading: false, daysPaid, gross, otAmt, pf, ded, monthly, total, netDue, paidOnSite, paidOffice, paid, remaining, note });
      if (remaining > 0) setPaymentForm((f) => ({ ...f, amount: remaining }));
    } catch {
      setSalaryCalc({ loading: false, daysPaid: 0, gross: 0, otAmt: 0, pf: 0, ded: 0, monthly: 0, total: 0, netDue: 0, paidOnSite: 0, paidOffice: 0, paid: 0, remaining: 0, note: 'Could not calculate salary for this worker and month.' });
    }
  };

  const openNewDialog = () => {
    setForm({
      worker_id: '',
      amount: 0,
      request_date: new Date().toISOString().split('T')[0],
      reason: '',
      remarks: '',
    });
    setErrors({});
    setDialogOpen(true);
  };

  const openPaymentDialog = () => {
    setReleaseMonth(lastMonth());
    setPaymentForm({
      worker_id: '',
      amount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      payment_location: 'On Site',
      remarks: '',
    });
    setPaymentErrors({});
    setPaymentOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = salaryPaymentSchema.safeParse(paymentForm);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      });
      setPaymentErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const pickedWorker = workers?.find((w) => w.id === paymentForm.worker_id);
      const { error } = await supabase.from('salary_payments').insert({
        worker_id: paymentForm.worker_id,
        site_id: pickedWorker?.site_id ?? null,
        amount: paymentForm.amount,
        payment_date: paymentForm.payment_date,
        salary_month: releaseMonth,
        payment_location: paymentForm.payment_location,
        remarks: paymentForm.remarks || null,
        created_by: user?.id ?? null,
      });

      if (error) throw error;

      toast({
        title: 'Salary released',
        description: `${pickedWorker?.name ?? 'Worker'} paid ${formatCurrency(paymentForm.amount)} for ${monthLabel(releaseMonth)} — ${paymentForm.payment_location}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['salary-payments'] });
      queryClient.invalidateQueries({ queryKey: ['report-salary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setPaymentOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Release failed', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const deletePayment = async () => {
    if (!paymentToDelete) return;
    try {
      const { error } = await supabase.from('salary_payments').delete().eq('id', paymentToDelete.id);
      if (error) throw error;
      toast({ title: 'Payment deleted', description: 'Salary release record removed.' });
      queryClient.invalidateQueries({ queryKey: ['salary-payments'] });
      queryClient.invalidateQueries({ queryKey: ['report-salary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Delete failed', description: message });
    }
    setPaymentToDelete(null);
  };

  const stats = useMemo(() => {
    if (!advances) return { total: 0, approved: 0, pending: 0, rejected: 0, approvedAmount: 0 };
    return {
      total: advances.length,
      approved: advances.filter((a: SalaryAdvance) => a.status === 'Approved').length,
      pending: advances.filter((a: SalaryAdvance) => a.status === 'Pending').length,
      rejected: advances.filter((a: SalaryAdvance) => a.status === 'Rejected').length,
      approvedAmount: advances
        .filter((a: SalaryAdvance) => a.status === 'Approved')
        .reduce((sum: number, a: SalaryAdvance) => sum + Number(a.amount), 0),
    };
  }, [advances]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = salaryAdvanceSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('salary_advances').insert({
        worker_id: form.worker_id,
        amount: form.amount,
        request_date: form.request_date,
        reason: form.reason,
        remarks: form.remarks || null,
        status: 'Pending',
        requested_by: user?.id ?? null,
      });

      if (error) throw error;

      toast({ title: 'Advance requested', description: 'The salary advance request has been submitted.' });
      queryClient.invalidateQueries({ queryKey: ['salary-advances'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Request failed', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async () => {
    if (!actionAdvance) return;
    const { advance, action } = actionAdvance;
    const newStatus = action === 'approve' ? 'Approved' : 'Rejected';

    try {
      const { error } = await supabase
        .from('salary_advances')
        .update({
          status: newStatus,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
        })
        .eq('id', advance.id);

      if (error) throw error;

      toast({
        title: action === 'approve' ? 'Advance approved' : 'Advance rejected',
        description: `${advance.worker?.name}'s request has been ${newStatus.toLowerCase()}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['salary-advances'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Action failed', description: message });
    }
    setActionAdvance(null);
  };

  return (
    <div>
      <PageHeader title="Salary & Advance Payments" description="Request worker salary advances and record salary releases (On Site / In Office)" />

      <Tabs defaultValue="advances">
        <TabsList className="mb-6">
          <TabsTrigger value="advances">Salary Advances</TabsTrigger>
          <TabsTrigger value="release">Salary Release</TabsTrigger>
        </TabsList>

        <TabsContent value="advances">
      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Advances" value={stats.total} icon={Wallet} />
        <StatCard label="Approved" value={stats.approved} icon={Check} iconColor="text-success" iconBg="bg-success/10" />
        <StatCard label="Pending" value={stats.pending} icon={Wallet} iconColor="text-warning" iconBg="bg-warning/10" />
        <StatCard label="Rejected" value={stats.rejected} icon={X} iconColor="text-destructive" iconBg="bg-destructive/10" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openNewDialog} disabled={!workers?.length}>
          <Plus className="mr-2 h-4 w-4" />
          Request Advance
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !advances || advances.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No advance requests"
            description="Submit a salary advance request to get started."
            action={
              <Button onClick={openNewDialog} disabled={!workers?.length}>
                <Plus className="mr-2 h-4 w-4" />
                Request Advance
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Worker</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead className="hidden lg:table-cell">Reason</TableHead>
                <TableHead>Status</TableHead>
                {role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {advances.map((advance) => (
                <TableRow key={advance.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{advance.worker?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{advance.worker?.worker_code}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(advance.amount)}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatDate(advance.request_date)}
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate lg:table-cell text-muted-foreground">
                    {advance.reason ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={advance.status} />
                  </TableCell>
                  {role === 'admin' && (
                    <TableCell className="text-right">
                      {advance.status === 'Pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setActionAdvance({ advance, action: 'approve' })}
                          >
                            <Check className="h-4 w-4 text-success" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setActionAdvance({ advance, action: 'reject' })}
                          >
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      </TabsContent>

        {/* Salary Release */}
        <TabsContent value="release">
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Payments" value={paymentsStats.count} icon={HandCoins} />
            <StatCard label="Total Released" value={formatCurrency(paymentsStats.total)} icon={Wallet} iconColor="text-success" iconBg="bg-success/10" />
            <StatCard label="On Site" value={formatCurrency(paymentsStats.onSite)} icon={Wallet} iconColor="text-warning" iconBg="bg-warning/10" />
            <StatCard label="In Office" value={formatCurrency(paymentsStats.inOffice)} icon={Wallet} iconColor="text-primary" iconBg="bg-primary/10" />
          </div>

          <div className="mb-4 flex justify-end">
            <Button onClick={openPaymentDialog} disabled={!workers?.length}>
              <HandCoins className="mr-2 h-4 w-4" />
              Release Salary
            </Button>
          </div>

          <div className="rounded-lg border border-border/60">
          {paymentsLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !payments || payments.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="No salary payments recorded"
              description="Mark your workers as paid (On Site or In Office) to see them here and in the salary sheet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden md:table-cell">For Month</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead>Paid At</TableHead>
                  <TableHead className="hidden xl:table-cell">Remarks</TableHead>
                  {role === 'admin' && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{p.worker?.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{p.worker?.worker_code}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-success">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {monthLabel(p.salary_month)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(p.payment_date)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          p.payment_location === 'On Site'
                            ? 'inline-flex items-center rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
                            : 'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                        }
                      >
                        {p.payment_location}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate lg:table-cell text-muted-foreground">
                      {p.remarks ?? '—'}
                    </TableCell>
                    {role === 'admin' && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setPaymentToDelete(p)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </div>
        </TabsContent>
      </Tabs>

      {/* New Advance Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Salary Advance</DialogTitle>
            <DialogDescription>
              Submit a salary advance request for a worker.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker_id">Worker</Label>
              <Select
                value={form.worker_id || 'none'}
                onValueChange={(v) => setForm({ ...form, worker_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a worker" />
                </SelectTrigger>
                <SelectContent>
                  {workers?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.worker_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.worker_id && <p className="text-xs text-destructive">{errors.worker_id}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  value={form.amount || ''}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="request_date">Date</Label>
                <Input
                  id="request_date"
                  type="date"
                  value={form.request_date}
                  onChange={(e) => setForm({ ...form, request_date: e.target.value })}
                />
                {errors.request_date && <p className="text-xs text-destructive">{errors.request_date}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Medical emergency"
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks (optional)</Label>
              <Textarea
                id="remarks"
                value={form.remarks ?? ''}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Release Salary Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Salary</DialogTitle>
            <DialogDescription>
              Record that a worker received their salary — paid On Site or In Office.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="release_month">Salary for month</Label>
              <Input
                id="release_month"
                type="month"
                value={releaseMonth}
                onChange={(e) => setReleaseMonth(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Select which month&apos;s salary this release is paying for.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_worker">Worker</Label>
              <Select
                value={paymentForm.worker_id || 'none'}
                onValueChange={(v) => setPaymentForm({ ...paymentForm, worker_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a worker" />
                </SelectTrigger>
                <SelectContent>
                  {workers?.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name} ({w.worker_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {paymentErrors.worker_id && <p className="text-xs text-destructive">{paymentErrors.worker_id}</p>}
            </div>
            {salaryCalc && (
              <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                {salaryCalc.loading ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Calculating salary for {monthLabel(releaseMonth)}...
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-semibold">
                      Salary for {monthLabel(releaseMonth)}
                      {paymentForm.worker_id && workers?.find((w) => w.id === paymentForm.worker_id)?.name
                        ? ` — ${workers.find((w) => w.id === paymentForm.worker_id)!.name}`
                        : ''}
                    </p>
                    {salaryCalc.note && <p className="text-destructive">{salaryCalc.note}</p>}
                    <p className="text-muted-foreground">
                      Monthly Salary (cap) {formatCurrency(salaryCalc.monthly)} · Working Days {salaryCalc.daysPaid} ·
                      Gross {formatCurrency(salaryCalc.gross)} · OT {formatCurrency(salaryCalc.otAmt)} ·
                      PF {formatCurrency(salaryCalc.pf)} · Deductions {formatCurrency(salaryCalc.ded)}
                    </p>
                    <p>
                      Total Salary {formatCurrency(salaryCalc.total)} · Net Due{' '}
                      <span className="font-semibold">{formatCurrency(salaryCalc.netDue)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Released so far: On Site {formatCurrency(salaryCalc.paidOnSite)} + In Office{' '}
                      {formatCurrency(salaryCalc.paidOffice)} = {formatCurrency(salaryCalc.paid)}
                    </p>
                    <p className="font-semibold">Remaining Due {formatCurrency(salaryCalc.remaining)}</p>
                    {salaryCalc.remaining <= 0 && (
                      <p className="font-semibold text-destructive">
                        Salary for {monthLabel(releaseMonth)} has already been fully released.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payment_amount">Amount (₹)</Label>
                <Input
                  id="payment_amount"
                  type="number"
                  min="1"
                  value={paymentForm.amount || ''}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                />
                {paymentErrors.amount && <p className="text-xs text-destructive">{paymentErrors.amount}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_date">Date</Label>
                <Input
                  id="payment_date"
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                />
                {paymentErrors.payment_date && <p className="text-xs text-destructive">{paymentErrors.payment_date}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_location">Paid where?</Label>
              <Select
                value={paymentForm.payment_location}
                onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_location: v as 'On Site' | 'In Office' })}
              >
                <SelectTrigger id="payment_location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="On Site">On Site</SelectItem>
                  <SelectItem value="In Office">In Office</SelectItem>
                </SelectContent>
              </Select>
              {paymentErrors.payment_location && <p className="text-xs text-destructive">{paymentErrors.payment_location}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_remarks">Remarks (optional)</Label>
              <Textarea
                id="payment_remarks"
                value={paymentForm.remarks ?? ''}
                onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                rows={2}
                placeholder="e.g. Month-end settlement"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || releaseBlocked}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Release Salary
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Payment Confirmation */}
      <AlertDialog open={!!paymentToDelete} onOpenChange={(open) => !open && setPaymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete salary release?</AlertDialogTitle>
            <AlertDialogDescription>
              {paymentToDelete
                ? `${formatCurrency(paymentToDelete.amount)} paid to ${paymentToDelete.worker?.name ?? 'worker'} for ${monthLabel(paymentToDelete.salary_month)} (${paymentToDelete.payment_location}) will be removed.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deletePayment}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve/Reject Confirmation */}
      <AlertDialog open={!!actionAdvance} onOpenChange={(open) => !open && setActionAdvance(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionAdvance?.action === 'approve' ? 'Approve advance?' : 'Reject advance?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionAdvance?.action === 'approve'
                ? `Approve ${formatCurrency(actionAdvance?.advance.amount ?? 0)} for ${actionAdvance?.advance.worker?.name}?`
                : `Reject the advance request from ${actionAdvance?.advance.worker?.name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction}>
              {actionAdvance?.action === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
