import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set('cwms_demo', '', {
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
  });
  return res;
}