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

  let body: { requestId?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { requestId, action } = body;

  if (!requestId || !action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: requestRow, error: fetchError } = await admin
    .from('supervisor_requests')
    .select('id, user_id, status')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError || !requestRow) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (requestRow.status !== 'Pending') {
    return NextResponse.json({ error: 'Request has already been decided' }, { status: 400 });
  }

  if (action === 'approve') {
    const { error: roleError } = await admin
      .from('user_roles')
      .upsert({ user_id: requestRow.user_id, role: 'supervisor' }, { onConflict: 'user_id, role' });
    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }
  }

  const update: Record<string, unknown> = {
    status: action === 'approve' ? 'Approved' : 'Rejected',
    decided_by: auth.user?.id ?? null,
    decided_at: new Date().toISOString(),
  };

  const { error: updateError } = await admin
    .from('supervisor_requests')
    .update(update)
    .eq('id', requestId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: update.status }, { status: 200 });
}