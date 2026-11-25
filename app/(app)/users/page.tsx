'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserCog,
  Plus,
  Loader2,
  Shield,
  Search,
  Trash2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { inviteUserSchema, type InviteUserFormValues } from '@/lib/validations';
import { formatDate, initials, roleLabel } from '@/lib/utils';
import type { Profile, AppRole } from '@/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function UsersPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleChangeUser, setRoleChangeUser] = useState<{ profile: Profile; currentRole: AppRole } | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<AppRole>('supervisor');
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [editUser, setEditUser] = useState<UserWithRole | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', mobile: '', email: '', newPassword: '', confirmPassword: '' });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState<InviteUserFormValues>({
    email: '',
    password: '',
    full_name: '',
    mobile: '',
    role: 'supervisor',
    site_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, full_name, email, mobile, created_at')
        .order('created_at', { ascending: false });
      if (pError) throw pError;

      const { data: roles, error: rError } = await supabase
        .from('user_roles')
        .select('user_id, role');
      if (rError) throw rError;

      const roleMap: Record<string, AppRole> = {};
      (roles as { user_id: string; role: AppRole }[] ?? []).forEach((r) => {
        roleMap[r.user_id] = r.role;
      });

      return ((profiles as Profile[]) ?? []).map((p) => ({
        ...p,
        role: roleMap[p.id] ?? 'supervisor',
      }));
    },
    enabled: role === 'admin',
  });

  const { data: sites } = useQuery({
    queryKey: ['users-sites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_name, site_code')
        .order('site_name');
      if (error) throw error;
      return (data as { id: string; site_name: string; site_code: string }[]) ?? [];
    },
    enabled: role === 'admin' && dialogOpen,
  });

  const filteredUsers = (users ?? []).filter(
    (u) =>
      !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = inviteUserSchema.safeParse(form);
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
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      toast({
        title: data.emailSent ? 'User created' : 'User created, but email failed',
        description: data.emailSent
          ? `${form.full_name} has been added as ${roleLabel(form.role as AppRole)}. Credentials were emailed.`
          : `${form.full_name} has been added, but credential email failed: ${data.emailError || 'Unknown error'}`,
        variant: data.emailSent ? 'default' : 'destructive',
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDialogOpen(false);
      setForm({ email: '', password: '', full_name: '', mobile: '', role: 'supervisor', site_id: '' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Failed to create user', description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeletingId(deleteUser.id);
    try {
      const res = await fetch('/api/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: deleteUser.id }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      toast({ title: 'User deleted', description: `${deleteUser.full_name} has been removed.` });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Delete failed', description: message });
    } finally {
      setDeletingId(null);
      setDeleteUser(null);
    }
  };

  const handleRoleChange = async () => {
    if (!roleChangeUser) return;
    const newRole: AppRole = roleChangeTarget;

    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: roleChangeUser.profile.id, role: newRole }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update role');
      }

      toast({
        title: 'Role updated',
        description: `${roleChangeUser.profile.full_name} is now ${roleLabel(newRole)}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Update failed', description: message });
    } finally {
      setSubmitting(false);
    }
    setRoleChangeUser(null);
  };

  const openEditUser = (u: UserWithRole) => {
    setEditUser(u);
    setEditForm({
      full_name: u.full_name || '',
      mobile: u.mobile || '',
      email: u.email || '',
      newPassword: '',
      confirmPassword: '',
    });
    setEditErrors({});
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    const fieldErrors: Record<string, string> = {};
    if (!editForm.full_name.trim()) fieldErrors.full_name = 'Full name is required';
    const emailChanged = editForm.email.trim() !== editUser.email;
    const wantsPasswordChange = editForm.newPassword.length > 0 || editForm.confirmPassword.length > 0;
    if (emailChanged && !editForm.email.trim()) fieldErrors.email = 'Email is required';
    if (emailChanged && !editForm.newPassword) fieldErrors.newPassword = 'New password required when changing email';
    if (wantsPasswordChange && editForm.newPassword.length < 6) fieldErrors.newPassword = 'Password must be at least 6 characters';
    if (wantsPasswordChange && editForm.newPassword !== editForm.confirmPassword) fieldErrors.confirmPassword = 'Passwords do not match';
    setEditErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setEditing(true);
    try {
      const payload: Record<string, string> = { userId: editUser.id };
      if (editForm.full_name.trim() !== editUser.full_name) payload.full_name = editForm.full_name.trim();
      if ((editForm.mobile.trim() || '') !== (editUser.mobile || '')) payload.mobile = editForm.mobile.trim();
      if (emailChanged) payload.newEmail = editForm.email.trim();
      if (editForm.newPassword) payload.newPassword = editForm.newPassword;

      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      const sentMsg = data.emailSent === true ? ' Credential email sent.' : data.emailSent === false ? ` Email failed: ${data.emailError || 'Unknown error'}` : '';
      toast({
        title: data.emailSent === false ? 'User updated, but email failed' : 'User updated',
        description: `${editUser.full_name} updated.${sentMsg}`,
        variant: data.emailSent === false ? 'destructive' : 'default',
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Update failed', description: message });
    } finally {
      setEditing(false);
    }
  };

  if (role !== 'admin') {
    return (
      <div>
        <PageHeader title="Users" />
        <EmptyState
          icon={UserCog}
          title="Access restricted"
          description="Only administrators can manage users."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Users" description="Manage system users and their roles">
        <Button onClick={() => { setForm({ email: '', password: '', full_name: '', mobile: '', role: 'supervisor', site_id: '' }); setErrors({}); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/60">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !filteredUsers.length ? (
          <EmptyState
            icon={UserCog}
            title="No users found"
            description="Add your first user to get started."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{initials(u.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => openEditUser(u)}
                        >
                          {u.full_name}
                        </button>
                        <button
                          type="button"
                          className="text-left text-xs text-muted-foreground hover:underline"
                          onClick={() => openEditUser(u)}
                        >
                          Edit credentials
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{u.mobile ?? 'â€”'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        u.role === 'admin'
                          ? 'default'
                          : u.role === 'site_incharge'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {roleLabel(u.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatDate(u.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditUser(u)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRoleChangeTarget(u.role);
                          setRoleChangeUser({ profile: u, currentRole: u.role });
                        }}
                      >
                        <Shield className="mr-1 h-4 w-4" />
                        Change Role
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === u.id}
                        onClick={() => setDeleteUser(u)}
                      >
                        {deletingId === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      {/* Add User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account with email and password. Share the credentials with the user so they can sign in.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                value={form.mobile ?? ''}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="Optional contact number"
              />
              {errors.mobile && <p className="text-xs text-destructive">{errors.mobile}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({ ...form, role: v as AppRole, site_id: v === 'site_incharge' ? (form.site_id || '') : '' })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="site_incharge">Site Incharge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === 'site_incharge' && (
              <div className="space-y-2">
                <Label htmlFor="site_id">Assign Site</Label>
                <Select
                  value={form.site_id || ''}
                  onValueChange={(v) => setForm({ ...form, site_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a site" />
                  </SelectTrigger>
                  <SelectContent>
                    {(sites ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.site_name} ({s.site_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.site_id && <p className="text-xs text-destructive">{errors.site_id}</p>}
                <p className="text-xs text-muted-foreground">
                  The site incharge account will be created and assigned to this site immediately.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Role Change Dialog */}
      <Dialog open={!!roleChangeUser} onOpenChange={(open) => !open && setRoleChangeUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Set the new role for {roleChangeUser?.profile.full_name}. Changing a
              site incharge&apos;s role cancels their request and removes any site
              assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={roleChangeTarget}
              onValueChange={(v) => setRoleChangeTarget(v as AppRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="site_incharge">Site Incharge</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleChangeUser(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} disabled={submitting || roleChangeTarget === roleChangeUser?.currentRole}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Change Role
            </Button>
      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user details. If you change email, you must set a new password and credentials will be emailed to the new email. If you change password, credentials will be emailed to the current email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input id="edit_full_name" value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
              {editErrors.full_name && <p className="text-xs text-destructive">{editErrors.full_name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input id="edit_email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              {editErrors.email && <p className="text-xs text-destructive">{editErrors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_mobile">Mobile</Label>
              <Input id="edit_mobile" value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_password">New Password</Label>
              <Input id="edit_password" type="password" value={editForm.newPassword} onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })} placeholder="Leave blank to keep unchanged" />
              {editErrors.newPassword && <p className="text-xs text-destructive">{editErrors.newPassword}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_confirm_password">Confirm New Password</Label>
              <Input id="edit_confirm_password" type="password" value={editForm.confirmPassword} onChange={(e) => setEditForm({ ...editForm, confirmPassword: e.target.value })} />
              {editErrors.confirmPassword && <p className="text-xs text-destructive">{editErrors.confirmPassword}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)} disabled={editing}>Cancel</Button>
              <Button type="submit" disabled={editing}>
                {editing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{deleteUser?.full_name}&quot; ({deleteUser?.email}).
              They will no longer be able to sign in, and their assigned sites will be unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
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
