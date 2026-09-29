import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/dashboard', request.url));
  res.cookies.set('cwms_demo', '1', {
    path: '/',
    maxAge: 60 * 60 * 24,
    sameSite: 'lax',
  });
  return res;
}