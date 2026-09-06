'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { MapPin, Plus, Search, Pencil, Power, PowerOff, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
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
import { siteSchema, type SiteFormValues } from '@/lib/validations';
import { formatDate } from '@/lib/utils';
import type { Site, Profile } from '@/types';

export default function SitesPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [toggleSite, setToggleSite] = useState<Site | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<SiteFormValues>({
    site_name: '',
    address: '',
    supervisor_id: '',
    status: 'Active',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select(`
          *,
          supervisor:profiles(id, full_name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Site[]) ?? [];
    },
  });

  const { data: supervisors } = useQuery({
    queryKey: ['supervisors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name');
      if (error) throw error;
      return (data as Profile[]) ?? [];
    },
  });

  const { data: workerCounts } = useQuery({
    queryKey: ['site-worker-counts-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('site_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data as { site_id: string | null }[] ?? []).forEach((w) => {
        if (w.site_id) counts[w.site_id] = (counts[w.site_id] ?? 0) + 1;
      });
      return counts;
    },
  });

  useEffect(() => {
    if (searchParams.get('action') === 'new' && role === 'admin') {
      openNewDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openNewDialog = () => {
    setEditingSite(null);
    setForm({ site_name: '', address: '', supervisor_id: '', status: 'Active' });
    setErrors({});
    setDialogOpen(true);
  };

  const openEditDialog = (site: Site) => {
    setEditingSite(site);
    setForm({
      site_name: site.site_name,
      address: site.address ?? '',
      supervisor_id: site.supervisor_id ?? '',
      status: site.status,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const filteredSites = useMemo(() => {
    if (!sites) return [];
    return sites.filter((s) => {
      const matchesSearch =
        !search ||
        s.site_name.toLowerCase().includes(search.toLowerCase()) ||
        s.site_code.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [sites, search, statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = siteSchema.safeParse(form);
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
      const payload = {
        site_name: form.site_name,
        address: form.address,
        supervisor_id: form.supervisor_id || null,
        status: form.status,
      };

      if (editingSite) {
        const { error } = await supabase
          .from('sites')
          .update(payload)
          .eq('id', editingSite.id);
        if (error) throw error;
        toast({ title: 'Site updated', description: `${form.site_name} has been updated.` });
      } else {
        const { data: codeData, error: codeError } = await supabase.rpc('generate_site_code');
        if (codeError) throw codeError;

        const { error } = await supabase
          .from('sites')
          .insert({ ...payload, site_code: codeData as string });
        if (error) throw error;
        toast({ title: 'Site created', description: `${form.site_name} has been added.` });
      }

      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Save failed', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!toggleSite) return;
    const newStatus = toggleSite.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const { error } = await supabase
        .from('sites')
        .update({ status: newStatus })
        .eq('id', toggleSite.id);
      if (error) throw error;
      toast({
        title: newStatus === 'Active' ? 'Site reactivated' : 'Site deactivated',
        description: `${toggleSite.site_name} is now ${newStatus}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Action failed', description: message });
    }
    setToggleSite(null);
  };

  if (role !== 'admin') {
    return (
      <div>
        <PageHeader title="Sites" />
        <EmptyState
          icon={MapPin}
          title="Access restricted"
          description="Only administrators can manage sites."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Sites" description="Manage construction sites and assignments">
        <Button onClick={openNewDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Site
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
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
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
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
        ) : filteredSites.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No sites found"
            description="Add your first construction site to get started."
            action={
              <Button onClick={openNewDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Site
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Address</TableHead>
                <TableHead>Supervisor</TableHead>
                <TableHead className="text-center">Workers</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-mono text-xs">{site.site_code}</TableCell>
                  <TableCell className="font-medium">{site.site_name}</TableCell>
                  <TableCell className="hidden max-w-xs truncate md:table-cell text-muted-foreground">
                    {site.address ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {site.supervisor?.full_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {workerCounts?.[site.id] ?? 0}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={site.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatDate(site.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(site)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToggleSite(site)}
                      >
                        {site.status === 'Active' ? (
                          <PowerOff className="h-4 w-4 text-warning" />
                        ) : (
                          <Power className="h-4 w-4 text-success" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSite ? 'Edit Site' : 'Add Site'}</DialogTitle>
            <DialogDescription>
              {editingSite
                ? 'Update site details below.'
                : 'Create a new construction site. Site code will be generated automatically.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="site_name">Site Name</Label>
              <Input
                id="site_name"
                value={form.site_name}
                onChange={(e) => setForm({ ...form, site_name: e.target.value })}
                placeholder="e.g. Downtown Tower Project"
              />
              {errors.site_name && (
                <p className="text-xs text-destructive">{errors.site_name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Site address"
                rows={2}
              />
              {errors.address && (
                <p className="text-xs text-destructive">{errors.address}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="supervisor">Assign Supervisor</Label>
              <Select
                value={form.supervisor_id || 'none'}
                onValueChange={(v) =>
                  setForm({ ...form, supervisor_id: v === 'none' ? '' : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a supervisor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supervisor assigned</SelectItem>
                  {supervisors?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name} ({s.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as 'Active' | 'Inactive' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingSite ? 'Save Changes' : 'Create Site'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Toggle Status Confirmation */}
      <AlertDialog open={!!toggleSite} onOpenChange={(open) => !open && setToggleSite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleSite?.status === 'Active' ? 'Deactivate site?' : 'Reactivate site?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleSite?.status === 'Active'
                ? `This will deactivate "${toggleSite?.site_name}". Workers will remain assigned but the site will be marked inactive.`
                : `This will reactivate "${toggleSite?.site_name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleStatus}>
              {toggleSite?.status === 'Active' ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
