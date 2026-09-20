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

  if (!['admin', 'supervisor', 'site_incharge'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const { data: authData, error: authError } =
    await getSupabaseAdmin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, registration_role: role },
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  if (!authData.user) {
    return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
  }

  const userId = authData.user.id;

  // The on_auth_user_created trigger auto-inserts a profile (with full_name),
  // assigns a default 'supervisor' role, and for 'site_incharge' metadata
  // assigns the site_incharge role plus a Pending site_incharge_requests row.
  // Update profile and promote admins from the default supervisor role.
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

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const auth = await assertAdmin(supabase);
  if (auth.error) return auth.error;

  let body: { userId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, role } = body;

  if (!userId || !role || !['admin', 'supervisor', 'site_incharge'].includes(role)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
  }

  // Prevent an admin from changing their own role.
  if (userId === auth.user?.id) {
    return NextResponse.json(
      { error: 'You cannot change your own role' },
      { status: 400 }
    );
  }

  const admin = getSupabaseAdmin();

  // Replace all role rows for the user with a single row for the new role.
  await admin.from('user_roles').delete().eq('user_id', userId);
  const { error: roleError } = await admin
    .from('user_roles')
    .insert({ user_id: userId, role });
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  if (role === 'site_incharge') {
    // Clear any existing assignment so the new request must be approved fresh.
    await admin.from('sites').update({ site_incharge_id: null }).eq('site_incharge_id', userId);

    // (Re)open a decision request if none is pending/approved.
    const { error: requestError } = await admin
      .from('site_incharge_requests')
      .upsert(
        {
          user_id: userId,
          site_id: null,
          status: 'Pending',
          requested_by: auth.user?.id ?? userId,
          decided_by: null,
          decided_at: null,
        },
        { onConflict: 'user_id' }
      );
    if (requestError) {
      return NextResponse.json({ error: requestError.message }, { status: 500 });
    }
  } else {
    // Any pending/approved site incharge request is cancelled.
    const { data: row } = await admin
      .from('site_incharge_requests')
      .select('id')
      .eq('user_id', userId)
      .single();
    if (row) {
      await admin
        .from('site_incharge_requests')
        .update({
          status: 'Rejected',
          decided_by: auth.user?.id ?? null,
          decided_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
    await admin.from('sites').update({ site_incharge_id: null }).eq('site_incharge_id', userId);
  }

  return NextResponse.json({ id: userId, role }, { status: 200 });
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