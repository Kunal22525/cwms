import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

async function assertAdmin(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: isAdmin } = await supabase.rpc('has_role', { p_role: 'admin' });
  if (!isAdmin) {
    return { user, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, error: null };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const auth = await assertAdmin(supabase);
  if (auth.error) return auth.error;

  let body: { email?: string; password?: string; full_name?: string; mobile?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { email, password, full_name, mobile, role } = body;

  if (!email || !password || !full_name || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!['admin', 'supervisor'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const { data: authData, error: authError } =
    await getSupabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
  }

  const userId = authData.user.id;

  // The on_auth_user_created trigger auto-inserts a profile (with full_name)
  // and assigns a default 'supervisor' role. Update both to the requested values.
  const profilePatch: { full_name: string; mobile?: string } = { full_name };
  if (mobile) profilePatch.mobile = mobile;

  await getSupabaseAdmin().from('profiles').update(profilePatch).eq('id', userId);

  // If an admin role was requested, promote from the default supervisor role.
  if (role === 'admin') {
    await getSupabaseAdmin()
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', userId)
      .eq('role', 'supervisor');
  }

  return NextResponse.json({ id: userId, email, full_name, role }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const auth = await assertAdmin(supabase);
  if (auth.error) return auth.error;

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
  }

  // Prevent an admin from deleting their own account
  if (userId === auth.user?.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account' },
      { status: 400 }
    );
  }

  const { error } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}