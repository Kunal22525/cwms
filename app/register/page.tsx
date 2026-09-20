'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HardHat,
  Mail,
  Lock,
  User,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  MailCheck,
  ShieldCheck,
  ClipboardCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [pendingIncharge, setPendingIncharge] = useState(false);
  const [role, setRole] = useState<'supervisor' | 'site_incharge'>('supervisor');

  useEffect(() => {
    if (!loading && user && !pendingIncharge) {
      router.replace('/dashboard');
    }
  }, [user, loading, router, pendingIncharge]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({ variant: 'destructive', title: 'Missing field', description: 'Please enter your full name.' });
      return;
    }
    if (!email) {
      toast({ variant: 'destructive', title: 'Missing field', description: 'Please enter your email.' });
      return;
    }
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Weak password', description: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'Password and confirmation must match.' });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim(), registration_role: role },
        },
      });

      if (error) {
        toast({ variant: 'destructive', title: 'Registration failed', description: error.message });
        setSubmitting(false);
        return;
      }

      // If no session is returned, email confirmation is required by the project.
      if (!data.session) {
        setCheckEmail(true);
        setSubmitting(false);
        return;
      }

      if (role === 'site_incharge') {
        // Site incharge accounts need admin/supervisor approval before use.
        setPendingIncharge(true);
        setSubmitting(false);
        return;
      }

      toast({ title: 'Account created', description: 'Welcome! You have been signed in.' });
      router.replace('/dashboard');
    } catch {
      toast({ variant: 'destructive', title: 'Registration failed', description: 'A network error occurred. Please try again.' });
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pendingIncharge || checkEmail) {
    const isIncharge = pendingIncharge || role === 'site_incharge';
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
        </div>
        <Card className="relative w-full max-w-md border-border/60 shadow-2xl">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              {pendingIncharge ? (
                <ClipboardCheck className="h-8 w-8 text-primary" />
              ) : (
                <MailCheck className="h-8 w-8 text-primary" />
              )}
            </div>
            {pendingIncharge ? (
              <>
                <CardTitle className="text-xl">Request submitted</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Your site incharge registration is <span className="font-medium text-foreground">pending approval</span>.
                  An admin or supervisor must approve your request and assign you a
                  site before you can access the application.
                </p>
                <Button variant="outline" onClick={() => router.replace('/login')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </>
            ) : (
              <>
                <CardTitle className="text-xl">Check your email</CardTitle>
                <p className="text-sm text-muted-foreground">
                  We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
                  {isIncharge
                    ? ' Once you confirm, an admin or supervisor will approve your '
                      + 'site incharge request and assign you a site.'
                    : ' Click it to activate your account, then sign in.'}
                </p>
                <Button variant="outline" onClick={() => router.replace('/login')}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <HardHat className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Construction Workforce
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Management System
          </p>
        </div>

        <Card className="border-border/60 shadow-2xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Create your account</CardTitle>
            <CardDescription>
              Register to access the dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                    autoComplete="name"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>I am a...</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole('supervisor')}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
                      role === 'supervisor'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <ShieldCheck className="h-5 w-5" />
                    <span className="text-sm font-medium">Supervisor</span>
                    <span className="text-xs text-muted-foreground">
                      Manages a site directly
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('site_incharge')}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
                      role === 'site_incharge'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <ClipboardCheck className="h-5 w-5" />
                    <span className="text-sm font-medium">Site Incharge</span>
                    <span className="text-xs text-muted-foreground">
                      Takes attendance, needs approval
                    </span>
                  </button>
                </div>
                {role === 'site_incharge' && (
                  <p className="text-xs text-muted-foreground">
                    Site incharge registrations require admin/supervisor approval
                    and a site assignment before you can sign in.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    autoComplete="email"
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    autoComplete="new-password"
                    disabled={submitting}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Construction Workforce Management System v1.0
        </p>
      </div>
    </div>
  );
}