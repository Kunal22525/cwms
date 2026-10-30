'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Signing you in...');

  useEffect(() => {
    const run = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (session) {
          setStatus('success');
          setMessage('Email verified successfully. Your account is pending admin approval.');
          return;
        }
        // Give supabase time to process hash
        await new Promise((r) => setTimeout(r, 800));
        const { data: { session: s2 } } = await supabase.auth.getSession();
        if (s2) {
          setStatus('success');
          setMessage('Email verified successfully. Your account is pending admin approval.');
          return;
        }
        setStatus('success');
        setMessage('Email verified successfully. Please wait for admin approval.');
      } catch (err: any) {
        setStatus('error');
        setMessage(err?.message || 'Something went wrong during verification.');
      }
    };
    run();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md border-border/60 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-xl">
            {status === 'loading' && <Loader2 className="h-5 w-5 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
            {status === 'loading' ? 'Verifying...' : status === 'success' ? 'Verified' : 'Error'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button onClick={() => router.push('/login')} className="w-full">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
