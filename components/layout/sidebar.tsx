'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MapPin,
  Users,
  CalendarCheck,
  Wallet,
  FileBarChart,
  UserCog,
  Settings,
  HardHat,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { useCompanySettings } from '@/lib/company-settings';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sites', href: '/sites', icon: MapPin, adminOnly: true },
  { label: 'Workers', href: '/workers', icon: Users },
  { label: 'Attendance', href: '/attendance', icon: CalendarCheck },
  { label: 'Salary Advances', href: '/salary-advances', icon: Wallet },
  { label: 'Reports', href: '/reports', icon: FileBarChart },
  { label: 'Users', href: '/users', icon: UserCog, adminOnly: true },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useAuth();
  const { data: company } = useCompanySettings();

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || role === 'admin'
  );

  return (
    <aside className="hidden h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
          {company?.logo_url ? (
            <Avatar className="h-8 w-8">
              <AvatarImage src={company.logo_url} alt="Company logo" className="object-contain" />
              <AvatarFallback>
                <HardHat className="h-5 w-5 text-primary" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <HardHat className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="max-w-[9rem] truncate text-sm font-bold text-foreground">
            {company?.company_name ?? 'CWMS'}
          </span>
          <span className="max-w-[9rem] truncate text-[10px] text-muted-foreground">
            {company?.tagline ?? 'Workforce Manager'}
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-6 py-4">
        <p className="text-[10px] text-muted-foreground">
          Construction Workforce
        </p>
        <p className="text-[10px] text-muted-foreground">Management System v1.0</p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { role } = useAuth();

  const visibleItems = navItems.filter(
    (item) => !item.adminOnly || role === 'admin'
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-sidebar-border bg-sidebar px-1 py-2 lg:hidden">
      {visibleItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate">{item.label.split(' ')[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
