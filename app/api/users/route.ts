import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { data: isAdmin } = await supabase.rpc('has_role', {
    p_role: 'admin',
  });

  if (!isAdmin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403 }
    );
  }

  let body: { email?: string; password?: string; full_name?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { email, password, full_name, role } = body;

  if (!email || !password || !full_name || !role) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 }
    );
  }

  if (!['admin', 'supervisor'].includes(role)) {
    return NextResponse.json(
      { error: 'Invalid role' },
      { status: 400 }
    );
  }

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

  if (authError) {
    return NextResponse.json(
      { error: authError.message },
      { status: 400 }
    );
  }

  if (!authData.user) {
    return NextResponse.json(
      { error: 'User creation failed' },
      { status: 500 }
    );
  }

  const userId = authData.user.id;

  // The on_auth_user_created trigger auto-inserts a profile (with full_name)
  // and assigns a default 'supervisor' role. Update both to the requested values.
  await supabaseAdmin
    .from('profiles')
    .update({ full_name })
    .eq('id', userId);

  // If an admin role was requested, promote from the default supervisor role.
  if (role === 'admin') {
    await supabaseAdmin
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', userId)
      .eq('role', 'supervisor');
  }

  return NextResponse.json(
    { id: userId, email, full_name, role },
    { status: 201 }
  );
}
