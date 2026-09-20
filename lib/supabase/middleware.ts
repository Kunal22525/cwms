import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/',
  '/dashboard',
  '/sites',
  '/workers',
  '/attendance',
  '/salary-advances',
  '/approvals',
  '/reports',
  '/documents',
  '/users',
  '/settings',
];

const ADMIN_ONLY_PREFIXES = ['/sites', '/users'];

const APPROVERS_ONLY_PREFIXES = ['/approvals'];

const isProtected = (pathname: string) =>
  PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

const isAdminOnly = (pathname: string) =>
  ADMIN_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

const isApproversOnly = (pathname: string) =>
  APPROVERS_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Redirect authenticated users away from the login/register pages
  if (user && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Protect all private routes: unauthenticated users go to /login
  if (!user && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Enforce admin-only routes for supervisors
  if (user && isAdminOnly(pathname)) {
    const { data: isAdmin } = await supabase.rpc('has_role', {
      p_role: 'admin',
    });
    if (!isAdmin) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // Enforce approver-only routes (Approvals) — admins and supervisors only
  if (user && isApproversOnly(pathname)) {
    const { data: isAdmin } = await supabase.rpc('has_role', {
      p_role: 'admin',
    });
    const { data: isSupervisor } = await supabase.rpc('has_role', {
      p_role: 'supervisor',
    });
    if (!isAdmin && !isSupervisor) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
