'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  User,
  Lock,
  Info,
  Loader2,
  HardHat,
  Building2,
  Upload,
  ImageOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { useCompanySettings } from '@/lib/company-settings';
import { COMPANY_NAME } from '@/lib/company';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { profileSchema } from '@/lib/validations';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

const LOGO_MAX_SIZE = 2 * 1024 * 1024;
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

export default function SettingsPage() {
  const { profile, user, role, refreshProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: company, isLoading: companyLoading } = useCompanySettings();

  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [mobile, setMobile] = useState(profile?.mobile ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [tagline, setTagline] = useState(company?.tagline ?? '');
  const [companyPhone, setCompanyPhone] = useState(company?.phone ?? '');
  const [companyEmail, setCompanyEmail] = useState(company?.email ?? '');
  const [companyAddress, setCompanyAddress] = useState(company?.address ?? '');
  const [companyGst, setCompanyGst] = useState(company?.gst_number ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(company?.logo_url ?? null);
  const [savingCompany, setSavingCompany] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = profileSchema.safeParse({ full_name: fullName, mobile });
    if (!result.success) {
      const firstError = result.error.issues[0];
      toast({ variant: 'destructive', title: 'Validation error', description: firstError.message });
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName, mobile: mobile || null })
        .eq('id', user?.id);

      if (error) throw error;

      toast({ title: 'Profile updated', description: 'Your profile has been saved.' });
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Update failed', description: message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'New password and confirmation must match.' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Password must be at least 6 characters.' });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast({ title: 'Password changed', description: 'Your password has been updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Password change failed', description: message });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast({
        variant: 'destructive',
        title: 'Invalid file type',
        description: 'Only JPG, PNG, WebP and SVG images are allowed.',
      });
      return;
    }
    if (file.size > LOGO_MAX_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Logo must be under 2MB.',
      });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCompany(true);
    try {
      let logoUrl = logoPreview;

      if (logoFile) {
        const ext = logoFile.name.split('.').pop();
        const filePath = `logo.${ext}`;

        // Remove any existing logo file
        if (company?.logo_url) {
          const oldName = company.logo_url.split('/').pop();
          if (oldName && oldName !== filePath) {
            await supabase.storage.from('company-assets').remove([oldName]);
          }
        }

        const { error: uploadError } = await supabase.storage
          .from('company-assets')
          .upload(filePath, logoFile, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('company-assets')
          .getPublicUrl(filePath);
        logoUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from('company_settings').upsert(
        {
          id: true,
          company_name: COMPANY_NAME,
          tagline: tagline.trim(),
          phone: companyPhone.trim() || null,
          email: companyEmail.trim() || null,
          address: companyAddress.trim() || null,
          gst_number: companyGst.trim() || null,
          logo_url: logoUrl ?? null,
        },
        { onConflict: 'id' }
      );

      if (error) throw error;

      toast({ title: 'Company updated', description: 'Company settings have been saved.' });
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      setLogoFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Save failed', description: message });
    } finally {
      setSavingCompany(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and application preferences" />

      <Tabs defaultValue="profile">
        <TabsList className="mb-4 flex flex-wrap">
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            Password
          </TabsTrigger>
          {role === 'admin' && (
            <TabsTrigger value="company" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Company
            </TabsTrigger>
          )}
          <TabsTrigger value="about" className="gap-1.5">
            <Info className="h-3.5 w-3.5" />
            About
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card className="max-w-lg border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Profile Information</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    value={profile?.email ?? user?.email ?? ''}
                    disabled
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed here.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mobile">Mobile</Label>
                  <Input
                    id="mobile"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="Your mobile number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div>
                    <Badge variant={role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                      {role}
                    </Badge>
                  </div>
                </div>
                <Button type="submit" disabled={savingProfile}>
                  {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Password Tab */}
        <TabsContent value="password">
          <Card className="max-w-lg border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Change Password</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={savingPassword}>
                  {savingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* About Tab */}
        <TabsContent value="about">
          <Card className="max-w-lg border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Application Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                  {company?.logo_url ? (
                    <Avatar className="h-14 w-14 rounded-xl">
                      <AvatarImage src={company.logo_url} alt="Company logo" />
                      <AvatarFallback>
                        <HardHat className="h-7 w-7 text-primary" />
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <HardHat className="h-7 w-7 text-primary" />
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold">{COMPANY_NAME}</p>
                  <p className="text-sm text-muted-foreground">Version 1.0</p>
                </div>
              </div>
              <div className="space-y-2 border-t border-border/60 pt-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Application</span>
                  <span className="text-sm font-medium">CWMS</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">1.0.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Your Role</span>
                  <span className="text-sm font-medium capitalize">{role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Backend</span>
                  <span className="text-sm font-medium">Supabase</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Tab (admin only) */}
        {role === 'admin' && (
          <TabsContent value="company">
            <Card className="max-w-lg border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-primary" />
                  Company Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                {companyLoading ? (
                  <Skeleton className="h-40 w-full" />
                ) : (
                  <form onSubmit={handleSaveCompany} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16 rounded-xl">
                        {logoPreview ? (
                          <AvatarImage src={logoPreview} alt="Company logo" />
                        ) : null}
                        <AvatarFallback className="rounded-xl">
                          <HardHat className="h-8 w-8 text-muted-foreground" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="logo" className="cursor-pointer">
                          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
                            <Upload className="h-4 w-4" />
                            {logoPreview ? 'Replace Logo' : 'Upload Logo'}
                          </div>
                          <Input
                            id="logo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml"
                            className="hidden"
                            onChange={handleLogoSelect}
                          />
                        </Label>
                        {logoPreview && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setLogoFile(null);
                              setLogoPreview(null);
                            }}
                          >
                            <ImageOff className="mr-1 h-4 w-4" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Company Name</Label>
                      <Input value={COMPANY_NAME} disabled readOnly className="bg-muted/50" />
                      <p className="text-xs text-muted-foreground">
                        Company name is fixed and cannot be edited here.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Tagline</Label>
                      <Input
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                        placeholder="e.g. Workforce Management System"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={companyPhone ?? ''}
                        onChange={(e) => setCompanyPhone(e.target.value)}
                        placeholder="Contact number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={companyEmail ?? ''}
                        onChange={(e) => setCompanyEmail(e.target.value)}
                        placeholder="contact@company.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Textarea
                        value={companyAddress ?? ''}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        rows={2}
                        placeholder="Registered / office address"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GST Number</Label>
                      <Input
                        value={companyGst ?? ''}
                        onChange={(e) => setCompanyGst(e.target.value)}
                        placeholder="e.g. 22AAAAA0000A1Z5"
                      />
                    </div>

                    <Button type="submit" disabled={savingCompany}>
                      {savingCompany && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Company
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Logo and company name appear on the login screen, sidebar and all exported Excel reports.
                    </p>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
