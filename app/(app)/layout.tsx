'use client';

import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { Sidebar, MobileNav } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
