'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { supabase } from '@/lib/supabase/client';
import { Sidebar, MobileNav } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SiteInchargeRequest } from '@/types';

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col lg:pl-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <div className="container mx-auto max-w-7xl px-4 py-6 lg:px-6 lg:py-8">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function SiteInchargeGate({ children }: { children: React.ReactNode }) {
  const { role, signOut } = useAuth();
  const [request, setRequest] = useState<SiteInchargeRequest | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(true);

  useEffect(() => {
    if (role !== 'site_incharge') return;
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await supabase.rpc('list_site_incharge_requests');
        if (!mounted) return;
        const list = (data ?? []) as SiteInchargeRequest[];
        setRequest(list[0] ?? null);
      } catch {
        // keep current state
      } finally {
        if (mounted) setLoadingRequest(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [role]);

  if (role !== 'site_incharge') {
    return <AppShell>{children}</AppShell>;
  }

  if (loadingRequest) {
    return <FullScreenLoader />;
  }

  if (!request || request.status === 'Pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border/60 shadow-2xl">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <ClipboardCheck className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-xl">Approval pending</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Your site incharge registration is waiting for an admin or
              supervisor to approve it and assign you a site. You will be able
              to access the application once approved.
            </CardDescription>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (request.status === 'Rejected') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border/60 shadow-2xl">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 ring-1 ring-destructive/20">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">Registration rejected</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Your site incharge registration was not approved. Contact an admin
              or supervisor if you believe this is a mistake.
            </CardDescription>
            <Button variant="outline" onClick={() => void signOut()}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return <FullScreenLoader />;
  }

  return <SiteInchargeGate>{children}</SiteInchargeGate>;
}