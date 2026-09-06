'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Plus,
  Search,
  Pencil,
  Eye,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { workerSchema, type WorkerFormValues } from '@/lib/validations';
import { formatCurrency, formatDate, initials } from '@/lib/utils';
import type { Worker, Site } from '@/types';

const PHOTO_MAX_SIZE = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function WorkersPage() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [search, setSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [tradeFilter, setTradeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [form, setForm] = useState<WorkerFormValues>({
    name: '',
    mobile: '',
    address: '',
    aadhaar: '',
    trade: '',
    daily_wage: null,
    joining_date: '',
    site_id: '',
    working_place: '',
    work_type: '',
    working_since: '',
    status: 'Active',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const PAGE_SIZE = 10;

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_name, site_code, status')
        .order('site_name');
      if (error) throw error;
      return (data as Site[]) ?? [];
    },
  });

  const { data: workers, isLoading } = useQuery({
    queryKey: ['workers', siteFilter, tradeFilter, statusFilter, search, page],
    queryFn: async () => {
      let query = supabase
        .from('workers')
        .select(`
          *,
          site:sites(id, site_name, site_code)
        `)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (siteFilter !== 'all') query = query.eq('site_id', siteFilter);
      if (tradeFilter !== 'all') query = query.eq('trade', tradeFilter);
      if (search) {
        query = query.or(`name.ilike.%${search}%,worker_code.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as Worker[]) ?? [];
    },
  });

  const { data: trades } = useQuery({
    queryKey: ['trades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('trade')
        .not('trade', 'is', null)
        .order('trade');
      if (error) throw error;
      const unique = [...new Set(((data as { trade: string }[]) ?? []).map((w) => w.trade).filter(Boolean))];
      return unique as string[];
    },
  });

  useEffect(() => {
    if (searchParams.get('action') === 'new') {
      openNewDialog();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openNewDialog = () => {
    setEditingWorker(null);
    setForm({
      name: '',
      mobile: '',
      address: '',
      aadhaar: '',
      trade: '',
      daily_wage: null,
      joining_date: '',
      site_id: sites?.[0]?.id ?? '',
      working_place: '',
      work_type: '',
      working_since: '',
      status: 'Active',
    });
    setErrors({});
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setDialogOpen(true);
  };

  const openEditDialog = (worker: Worker) => {
    setEditingWorker(worker);
    setForm({
      name: worker.name,
      mobile: worker.mobile ?? '',
      address: worker.address ?? '',
      aadhaar: worker.aadhaar ?? '',
      trade: worker.trade ?? '',
      daily_wage: worker.daily_wage,
      joining_date: worker.joining_date ?? '',
      site_id: worker.site_id ?? '',
      working_place: worker.working_place ?? '',
      work_type: worker.work_type ?? '',
      working_since: worker.working_since ?? '',
      status: worker.status,
    });
    setErrors({});
    setPhotoFile(null);
    setPhotoPreview(worker.photo_url);
    setRemovePhoto(false);
    setDialogOpen(true);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only JPG, PNG, and WebP images are allowed.',
      });
      return;
    }
    if (file.size > PHOTO_MAX_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Photo must be under 5MB.',
      });
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  };

  const uploadPhoto = async (workerId: string): Promise<string | null> => {
    if (!photoFile) {
      if (removePhoto) return null;
      return editingWorker?.photo_url ?? null;
    }

    const ext = photoFile.name.split('.').pop();
    const fileName = `${workerId}.${ext}`;
    const filePath = `${fileName}`;

    if (editingWorker?.photo_url) {
      const oldPath = editingWorker.photo_url.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('worker-photos').remove([oldPath]);
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('worker-photos')
      .upload(filePath, photoFile, { upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('worker-photos')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = workerSchema.safeParse(form);
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
        name: form.name,
        mobile: form.mobile || null,
        address: form.address || null,
        aadhaar: form.aadhaar || null,
        trade: form.trade,
        daily_wage: form.daily_wage ?? null,
        joining_date: form.joining_date || null,
        site_id: form.site_id || null,
        working_place: form.working_place || null,
        work_type: form.work_type || null,
        working_since: form.working_since || null,
        status: form.status,
      };

      if (editingWorker) {
        const photoUrl = await uploadPhoto(editingWorker.id);
        const { error } = await supabase
          .from('workers')
          .update({ ...payload, photo_url: photoUrl })
          .eq('id', editingWorker.id);
        if (error) throw error;
        toast({ title: 'Worker updated', description: `${form.name} has been updated.` });
      } else {
        const { data: codeData, error: codeError } = await supabase.rpc('generate_worker_code');
        if (codeError) throw codeError;

        const { data: newWorker, error } = await supabase
          .from('workers')
          .insert({ ...payload, worker_code: codeData as string, photo_url: null })
          .select('id')
          .single();
        if (error) throw error;

        if (photoFile) {
          const photoUrl = await uploadPhoto(newWorker.id);
          if (photoUrl) {
            await supabase
              .from('workers')
              .update({ photo_url: photoUrl })
              .eq('id', newWorker.id);
          }
        }
        toast({ title: 'Worker added', description: `${form.name} has been added.` });
      }

      queryClient.invalidateQueries({ queryKey: ['workers'] });
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Save failed', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const canManage = role === 'admin';

  return (
    <div>
      <PageHeader title="Workers" description="Manage your construction workforce">
        {canManage && (
          <Button onClick={openNewDialog} disabled={!sites?.length}>
            <Plus className="mr-2 h-4 w-4" />
            Add Worker
          </Button>
        )}
      </PageHeader>

      {!sites?.length && canManage && (
        <div className="mb-4 rounded-lg border border-warning/20 bg-warning/5 p-4 text-sm text-warning">
          You need to create at least one site before adding workers.
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-10"
          />
        </div>
        <Select value={siteFilter} onValueChange={(v) => { setSiteFilter(v); setPage(0); }}>
          <SelectTrigger>
            <SelectValue placeholder="All Sites" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sites</SelectItem>
            {sites?.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tradeFilter} onValueChange={(v) => { setTradeFilter(v); setPage(0); }}>
          <SelectTrigger>
            <SelectValue placeholder="All Trades" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trades</SelectItem>
            {trades?.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger>
            <SelectValue placeholder="All Status" />
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
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !workers || workers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No workers found"
            description="Add your first worker to get started."
            action={
              canManage && sites?.length ? (
                <Button onClick={openNewDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Worker
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Trade</TableHead>
                <TableHead className="hidden lg:table-cell">Site</TableHead>
                <TableHead className="hidden md:table-cell">Wage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((worker) => (
                <TableRow key={worker.id}>
                  <TableCell className="font-mono text-xs">{worker.worker_code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        {worker.photo_url ? (
                          <AvatarImage src={worker.photo_url} alt={worker.name} />
                        ) : null}
                        <AvatarFallback className="text-xs">
                          {initials(worker.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{worker.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {worker.trade ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {worker.site?.site_name ?? '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {worker.daily_wage ? formatCurrency(worker.daily_wage) : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={worker.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/workers/${worker.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(worker)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {workers && workers.length === PAGE_SIZE && (
        <div className="mt-4 flex justify-center">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={workers.length < PAGE_SIZE}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWorker ? 'Edit Worker' : 'Add Worker'}</DialogTitle>
            <DialogDescription>
              {editingWorker
                ? 'Update worker details below.'
                : 'Worker code will be generated automatically.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Photo Upload */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {photoPreview ? (
                    <AvatarImage src={photoPreview} alt="Preview" />
                  ) : null}
                  <AvatarFallback className="text-lg">
                    {photoPreview ? '' : <Users className="h-8 w-8 text-muted-foreground" />}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="photo" className="cursor-pointer">
                  <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                    <Upload className="h-4 w-4" />
                    {photoPreview ? 'Replace Photo' : 'Upload Photo'}
                  </div>
                  <Input
                    id="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </Label>
                {photoPreview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhotoFile(null);
                      setPhotoPreview(null);
                      setRemovePhoto(true);
                    }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile</Label>
                <Input
                  id="mobile"
                  value={form.mobile ?? ''}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
                {errors.mobile && <p className="text-xs text-destructive">{errors.mobile}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address ?? ''}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="aadhaar">Aadhaar (optional)</Label>
                <Input
                  id="aadhaar"
                  value={form.aadhaar ?? ''}
                  onChange={(e) => setForm({ ...form, aadhaar: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="trade">Trade</Label>
                <Input
                  id="trade"
                  value={form.trade}
                  onChange={(e) => setForm({ ...form, trade: e.target.value })}
                  placeholder="e.g. Mason, Electrician"
                />
                {errors.trade && <p className="text-xs text-destructive">{errors.trade}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="daily_wage">Daily Wage (₹)</Label>
                <Input
                  id="daily_wage"
                  type="number"
                  value={form.daily_wage ?? ''}
                  onChange={(e) => setForm({ ...form, daily_wage: e.target.value ? Number(e.target.value) : null })}
                />
                {errors.daily_wage && <p className="text-xs text-destructive">{errors.daily_wage}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="site_id">Site Assigned</Label>
                <Select
                  value={form.site_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, site_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No site assigned</SelectItem>
                    {sites?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.site_id && <p className="text-xs text-destructive">{errors.site_id}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="joining_date">Joining Date</Label>
                <Input
                  id="joining_date"
                  type="date"
                  value={form.joining_date ?? ''}
                  onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="working_since">Working Since</Label>
                <Input
                  id="working_since"
                  type="date"
                  value={form.working_since ?? ''}
                  onChange={(e) => setForm({ ...form, working_since: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="working_place">Working Place</Label>
                <Input
                  id="working_place"
                  value={form.working_place ?? ''}
                  onChange={(e) => setForm({ ...form, working_place: e.target.value })}
                  placeholder="e.g. Block A"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="work_type">Type of Work</Label>
                <Input
                  id="work_type"
                  value={form.work_type ?? ''}
                  onChange={(e) => setForm({ ...form, work_type: e.target.value })}
                  placeholder="e.g. Plastering"
                />
              </div>
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
                {editingWorker ? 'Save Changes' : 'Add Worker'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
