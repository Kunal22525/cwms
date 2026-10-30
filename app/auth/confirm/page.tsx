'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

export default function AuthConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    const verify = async () => {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        const url = new URL(typeof window !== 'undefined' ? window.location.href : 'http://x');
        const token_hash = searchParams.get('token_hash') || url.searchParams.get('token_hash');
        const type = searchParams.get('type') || url.searchParams.get('type') || 'email';
        const code = searchParams.get('code') || url.searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as any });
          if (error) throw error;
        }

        const { data: { session } } = await supabase.auth.getSession();
        setStatus('success');
        setMessage(session
          ? 'Your email has been verified. Your account is pending admin approval.'
          : 'Your email has been verified successfully. Please wait for admin approval.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.message || 'Verification failed. The link may be invalid or expired.');
      }
    };

    verify();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            {status === 'loading' && <Loader2 className="h-5 w-5 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
            {status === 'loading' ? 'Verifying...' : status === 'success' ? 'Email Verified' : 'Verification Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{message}</p>
          {status === 'success' && (
            <Button onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          )}
          {status === 'error' && (
            <Button onClick={() => router.push('/register')} variant="outline" className="w-full">
              Back to Register
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
