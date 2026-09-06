'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import {
  Wallet,
  Plus,
  Loader2,
  Check,
  X,
  Search,
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
import { salaryAdvanceSchema, type SalaryAdvanceFormValues } from '@/lib/validations';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SalaryAdvance, Worker, Site } from '@/types';

export default function SalaryAdvancesPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
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
      <PageHeader title="Salary Advances" description="Request and manage worker salary advances">
        <Button onClick={openNewDialog} disabled={!workers?.length}>
          <Plus className="mr-2 h-4 w-4" />
          Request Advance
        </Button>
      </PageHeader>

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
