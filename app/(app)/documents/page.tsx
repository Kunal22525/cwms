'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Download,
  Loader2,
  Trash2,
  Upload,
  FileWarning,
  FileX2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Badge } from '@/components/ui/badge';
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
import { formatDate } from '@/lib/utils';
import type { Document } from '@/types';

const DOC_MAX_SIZE = 20 * 1024 * 1024;
const REMINDER_OPTIONS = [5, 15, 30];

function daysUntil(expiryDate: string | null | undefined): number | null {
  if (!expiryDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

export default function DocumentsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    from_date: '',
    expiry_date: '',
    remind_me: true,
    reminder_days: 15,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*, uploaded_by_profile:profiles(id, full_name)')
        .order('expiry_date', { ascending: true });
      if (error) throw error;
      return (data as Document[]) ?? [];
    },
  });

  const { expiring, expired } = useMemo(() => {
    const expiring: { doc: Document; days: number }[] = [];
    const expired: { doc: Document; days: number }[] = [];
    (documents ?? []).forEach((doc) => {
      const d = daysUntil(doc.expiry_date);
      if (d == null) return;
      if (d < 0) {
        expired.push({ doc, days: Math.abs(d) });
      } else if (doc.remind_me && d <= doc.reminder_days) {
        expiring.push({ doc, days: d });
      }
    });
    return { expiring, expired };
  }, [documents]);

  const canManage = role === 'admin';

  const openNewDialog = () => {
    setForm({
      title: '',
      description: '',
      from_date: '',
      expiry_date: '',
      remind_me: true,
      reminder_days: 15,
    });
    setFile(null);
    setErrors({});
    setDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > DOC_MAX_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Documents must be under 20MB.',
      });
      return;
    }
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.title.trim()) nextErrors.title = 'Title is required';
    if (!file) nextErrors.file = 'Please choose a file';
    if (!form.expiry_date) nextErrors.expiry_date = 'Expiry date is required';
    if (form.from_date && form.expiry_date && form.expiry_date < form.from_date) {
      nextErrors.expiry_date = 'Expiry date cannot be before the From date';
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const id = crypto.randomUUID();
      const ext = file!.name.split('.').pop() ?? 'file';
      const storagePath = `${id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file!, {
          contentType: file!.type || 'application/octet-stream',
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      const { error: insertError } = await supabase.from('documents').insert({
        id,
        title: form.title.trim(),
        description: form.description.trim() || null,
        file_name: file!.name,
        storage_path: storagePath,
        file_url: urlData.publicUrl,
        file_type: file!.type || null,
        file_size_bytes: file!.size,
        from_date: form.from_date || null,
        expiry_date: form.expiry_date,
        remind_me: form.remind_me,
        reminder_days: form.reminder_days,
      });
      if (insertError) throw insertError;

      toast({ title: 'Document uploaded', description: `${form.title.trim()} has been saved.` });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setDialogOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Upload failed', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    try {
      await supabase.storage.from('documents').remove([deleteDoc.storage_path]);
      const { error } = await supabase.from('documents').delete().eq('id', deleteDoc.id);
      if (error) throw error;
      toast({ title: 'Document deleted', description: `${deleteDoc.title} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Delete failed', description: message });
    }
    setDeleteDoc(null);
  };

  const statusBadge = (doc: Document): React.ReactNode => {
    const d = daysUntil(doc.expiry_date);
    if (d == null) return <Badge variant="outline">Unknown</Badge>;
    if (d < 0) return <Badge variant="destructive">Expired {Math.abs(d)}d ago</Badge>;
    if (doc.remind_me && d <= doc.reminder_days)
      return <Badge variant="destructive">Expiring in {d}d</Badge>;
    return <Badge variant="secondary">Valid</Badge>;
  };

  return (
    <div>
      <PageHeader title="Documents" description="Company documents with expiry tracking">
        {canManage && (
          <Button onClick={openNewDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </PageHeader>

      {/* Expiry reminders */}
      {(expiring.length > 0 || expired.length > 0) && (
        <div className="mb-6 space-y-3">
          {expired.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <FileX2 className="h-4 w-4" />
                Expired Documents
              </div>
              <ul className="mt-2 space-y-1">
                {expired.map(({ doc, days }) => (
                  <li key={doc.id} className="flex items-center justify-between text-sm text-destructive/90">
                    <span>{doc.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Expired {days} day{days === 1 ? '' : 's'} ago ({formatDate(doc.expiry_date)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {expiring.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                <FileWarning className="h-4 w-4" />
                Documents Expiring Soon
              </div>
              <ul className="mt-2 space-y-1">
                {expiring.map(({ doc, days }) => (
                  <li key={doc.id} className="flex items-center justify-between text-sm text-warning/90">
                    <span>{doc.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {days === 0 ? 'Expires today' : `${days} day${days === 1 ? '' : 's'} left`} ({formatDate(doc.expiry_date)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border/60">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !documents || documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents"
            description="Upload your first document to track its expiry."
            action={
              canManage ? (
                <Button onClick={openNewDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">From</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="hidden lg:table-cell">Reminder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">{doc.file_name}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatDate(doc.from_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(doc.expiry_date)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {doc.remind_me ? `Before ${doc.reminder_days} days` : 'Off'}
                  </TableCell>
                  <TableCell>{statusBadge(doc)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Download className="mr-1.5 h-4 w-4" />
                          Open
                        </a>
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteDoc(doc)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Upload dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Add a document with its validity period and expiry reminder.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Site Insurance Policy"
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="What is this document for?"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-file">File (PDF, image, Word, Excel)</Label>
              <label htmlFor="doc-file" className="cursor-pointer">
                <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                  <Upload className="h-4 w-4" />
                  {file ? file.name : 'Choose a file'}
                </div>
                <Input
                  id="doc-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
              {errors.file && <p className="text-xs text-destructive">{errors.file}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="from_date">From Date</Label>
                <Input
                  id="from_date"
                  type="date"
                  value={form.from_date}
                  onChange={(e) => setForm({ ...form, from_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry_date">Expiry Date</Label>
                <Input
                  id="expiry_date"
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                />
                {errors.expiry_date && <p className="text-xs text-destructive">{errors.expiry_date}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiry Reminder</Label>
              <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    id="remind"
                    checked={form.remind_me}
                    onChange={(e) => setForm({ ...form, remind_me: e.target.checked })}
                  />
                  <label htmlFor="remind" className="text-sm font-medium">
                    Remind me before expiry
                  </label>
                </div>
                <Select
                  value={String(form.reminder_days)}
                  onValueChange={(v) => setForm({ ...form, reminder_days: Number(v) })}
                  disabled={!form.remind_me}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                You will see the expiring/expired documents highlighted as reminders across the
                website.
              </p>
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
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDoc} onOpenChange={(open) => !open && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteDoc?.title}&quot; and its file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}