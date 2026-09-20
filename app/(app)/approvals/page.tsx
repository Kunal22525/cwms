'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Loader2, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
import { formatDate, formatDateTime } from '@/lib/utils';
import type { Site, SiteInchargeRequest, WorkerChangeRequest } from '@/types';

type DecideAction = 'approve' | 'reject';

async function decideSiteIncharge(requestId: string, action: DecideAction, siteId?: string) {
  const res = await fetch('/api/site-incharge-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, action, siteId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function decideWorkerChange(requestId: string, action: DecideAction) {
  const res = await fetch('/api/worker-change-requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, action }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function ApprovalsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [siteRequestDialog, setSiteRequestDialog] = useState<SiteInchargeRequest | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [siteRequestToReject, setSiteRequestToReject] = useState<SiteInchargeRequest | null>(null);
  const [workerRequestToDecide, setWorkerRequestToDecide] = useState<{
    request: WorkerChangeRequest;
    action: DecideAction;
  } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: siteRequests, isLoading: siteLoading } = useQuery({
    queryKey: ['site-incharge-requests'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_site_incharge_requests');
      if (error) throw error;
      return (data as SiteInchargeRequest[]) ?? [];
    },
  });

  const { data: workerRequests, isLoading: workerLoading } = useQuery({
    queryKey: ['approval-worker-change-requests'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_worker_change_requests');
      if (error) throw error;
      return (data as WorkerChangeRequest[]) ?? [];
    },
  });

  const { data: sites } = useQuery({
    queryKey: ['approval-sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_name, site_code, site_incharge_id')
        .order('site_name');
      if (error) throw error;
      return (data as Site[]) ?? [];
    },
  });

  const pendingSites = siteRequests ?? [];

  const openApproveDialog = (request: SiteInchargeRequest) => {
    setSelectedSiteId(request.site_id ?? '');
    setSiteRequestDialog(request);
  };

  const confirmApproveSite = async () => {
    if (!siteRequestDialog) return;
    if (!selectedSiteId) {
      toast({ variant: 'destructive', title: 'Site required', description: 'Select a site to assign.' });
      return;
    }
    setPendingId(siteRequestDialog.id);
    try {
      await decideSiteIncharge(siteRequestDialog.id, 'approve', selectedSiteId);
      toast({
        title: 'Request approved',
        description: `${siteRequestDialog.full_name ?? 'User'} assigned as site incharge.`,
      });
      queryClient.invalidateQueries({ queryKey: ['site-incharge-requests'] });
      queryClient.invalidateQueries({ queryKey: ['approval-sites'] });
      queryClient.invalidateQueries({ queryKey: ['approval-worker-change-requests'] });
      setSiteRequestDialog(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      toast({ variant: 'destructive', title: 'Approval failed', description: message });
    } finally {
      setPendingId(null);
    }
  };

  const confirmRejectSite = async () => {
    if (!siteRequestToReject) return;
    setPendingId(siteRequestToReject.id);
    try {
      await decideSiteIncharge(siteRequestToReject.id, 'reject');
      toast({ title: 'Request rejected', description: 'The site incharge registration was rejected.' });
      queryClient.invalidateQueries({ queryKey: ['site-incharge-requests'] });
      setSiteRequestToReject(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      toast({ variant: 'destructive', title: 'Update failed', description: message });
    } finally {
      setPendingId(null);
    }
  };

  const confirmWorkerDecide = async () => {
    if (!workerRequestToDecide) return;
    const { request, action } = workerRequestToDecide;
    setPendingId(`wc-${request.id}`);
    try {
      await decideWorkerChange(request.id, action);
      toast({
        title: action === 'approve' ? 'Request approved' : 'Request rejected',
        description:
          action === 'approve'
            ? request.request_type === 'add'
              ? `${request.worker_name ?? 'New worker'} has been added.`
              : `${request.worker_name ?? 'Worker'} has been removed.`
            : 'The request was rejected.',
      });
      queryClient.invalidateQueries({ queryKey: ['approval-worker-change-requests'] });
      queryClient.invalidateQueries({ queryKey: ['approval-sites'] });
      setWorkerRequestToDecide(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      toast({ variant: 'destructive', title: 'Update failed', description: message });
    } finally {
      setPendingId(null);
    }
  };

  const renderWorkerName = (r: WorkerChangeRequest) => {
    if (r.worker_name) return r.worker_name;
    const payloadName = (r.payload as { name?: string } | null)?.name;
    return payloadName ?? 'New worker';
  };

  return (
    <div>
      <PageHeader
        title="Approvals"
        description="Review and decide site incharge registrations and worker change requests"
      />

      {/* Site Incharge Registrations */}
      <div className="mb-8 rounded-lg border border-border/60">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <BadgeCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Site Incharge Registrations</h2>
        </div>
        <div className="overflow-x-auto">
          {siteLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !pendingSites.length ? (
            <EmptyState
              icon={BadgeCheck}
              title="No registrations"
              description="New site incharge registrations will appear here for approval."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSites.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-medium">{req.full_name ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{req.email ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(req.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === 'Pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pendingId === req.id}
                            onClick={() => setSiteRequestToReject(req)}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={pendingId === req.id}
                            onClick={() => openApproveDialog(req)}
                          >
                            {pendingId === req.id ? (
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                            ) : (
                              <BadgeCheck className="mr-1 h-4 w-4" />
                            )}
                            Approve &amp; Assign
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {req.site_name
                            ? `Assigned: ${req.site_name}`
                            : `Decided ${formatDateTime(req.decided_at)}`}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Worker Change Requests */}
      <div className="rounded-lg border border-border/60">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Worker Change Requests</h2>
        </div>
        <div className="overflow-x-auto">
          {workerLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !workerRequests?.length ? (
            <EmptyState
              icon={UserPlus}
              title="No requests"
              description="Requests from site incharge to add or remove workers will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead className="hidden md:table-cell">Site</TableHead>
                  <TableHead className="hidden lg:table-cell">Requested by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workerRequests!.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${req.request_type === 'add' ? 'text-success' : 'text-destructive'}`}>
                        {req.request_type === 'add' ? (
                          <UserPlus className="h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        {req.request_type === 'add' ? 'Add' : 'Remove'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{renderWorkerName(req)}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {req.site_name ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {req.requester_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {formatDate(req.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      {req.status === 'Pending' ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pendingId === `wc-${req.id}`}
                            onClick={() => setWorkerRequestToDecide({ request: req, action: 'reject' })}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={pendingId === `wc-${req.id}`}
                            onClick={() => setWorkerRequestToDecide({ request: req, action: 'approve' })}
                          >
                            <BadgeCheck className="mr-1 h-4 w-4" />
                            Approve
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(req.decided_at)}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Approve & Assign Site Dialog */}
      <Dialog open={!!siteRequestDialog} onOpenChange={(open) => !open && setSiteRequestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve site incharge</DialogTitle>
            <DialogDescription>
              Assign a site to {siteRequestDialog?.full_name ?? 'this user'}. They will only
              manage workers and attendance for this site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Site</Label>
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                {sites?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.site_name}
                    {s.site_incharge_id ? ' (already assigned)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === 'supervisor'
                ? 'You can only assign sites you supervise.'
                : 'Assigning replaces any previous site incharge on that site.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSiteRequestDialog(null)} disabled={pendingId === siteRequestDialog?.id}>
              Cancel
            </Button>
            <Button onClick={confirmApproveSite} disabled={pendingId === siteRequestDialog?.id}>
              {pendingId === siteRequestDialog?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Approve &amp; Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Site Incharge Confirmation */}
      <AlertDialog open={!!siteRequestToReject} onOpenChange={(open) => !open && setSiteRequestToReject(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject registration?</AlertDialogTitle>
            <AlertDialogDescription>
              {siteRequestToReject?.full_name}&apos;s site incharge registration
              ({siteRequestToReject?.email}) will be rejected and they will not be
              able to access the application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === siteRequestToReject?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRejectSite}
              disabled={pendingId === siteRequestToReject?.id}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Worker Request Decision Confirmation */}
      <AlertDialog open={!!workerRequestToDecide} onOpenChange={(open) => !open && setWorkerRequestToDecide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {workerRequestToDecide?.action === 'approve' ? 'Approve request?' : 'Reject request?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {workerRequestToDecide?.action === 'approve' ? (
                workerRequestToDecide.request.request_type === 'add' ? (
                  <>
                    <span className="font-medium">{renderWorkerName(workerRequestToDecide.request)}</span> will be
                    added to {workerRequestToDecide.request.site_name ?? 'the site'} with worker details from the request.
                  </>
                ) : (
                  <>
                    <span className="font-medium">{renderWorkerName(workerRequestToDecide.request)}</span> will be
                    permanently removed from the system, including their attendance and advance history.
                  </>
                )
              ) : (
                'The worker change request will be rejected and no changes will be made.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingId === `wc-${workerRequestToDecide?.request.id}`}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmWorkerDecide}
              disabled={pendingId === `wc-${workerRequestToDecide?.request.id}`}
              className={workerRequestToDecide?.action === 'reject' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
            >
              {workerRequestToDecide?.action === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}