import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

async function assertApprover(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, isSupervisor: false, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: isAdmin } = await supabase.rpc('has_role', { p_role: 'admin' });
  if (isAdmin) {
    return { user, isSupervisor: false, error: null };
  }

  const { data: isSupervisor } = await supabase.rpc('has_role', { p_role: 'supervisor' });
  if (isSupervisor) {
    return { user, isSupervisor: true, error: null };
  }

  return { user, isSupervisor: false, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const auth = await assertApprover(supabase);
  if (auth.error) return auth.error;

  let body: { requestId?: string; action?: string; siteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { requestId, action, siteId } = body;

  if (!requestId || !action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: requestRow, error: fetchError } = await admin
    .from('site_incharge_requests')
    .select('id, user_id, site_id, status')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError || !requestRow) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (requestRow.status !== 'Pending') {
    return NextResponse.json({ error: 'Request has already been decided' }, { status: 400 });
  }

  if (action === 'approve') {
    if (!siteId) {
      return NextResponse.json({ error: 'A site must be assigned on approval' }, { status: 400 });
    }

    // Supervisors may only assign a site they supervise.
    if (auth.isSupervisor) {
      const { data: site } = await admin
        .from('sites')
        .select('id')
        .eq('id', siteId)
        .eq('supervisor_id', auth.user?.id)
        .maybeSingle();
      if (!site) {
        return NextResponse.json(
          { error: 'You can only assign a site you supervise' },
          { status: 403 }
        );
      }
    }

    // Unassign the user from any previously assigned site, then assign the new one.
    await admin.from('sites').update({ site_incharge_id: null }).eq('site_incharge_id', requestRow.user_id);
    const { error: siteError } = await admin
      .from('sites')
      .update({ site_incharge_id: requestRow.user_id })
      .eq('id', siteId);
    if (siteError) {
      return NextResponse.json({ error: siteError.message }, { status: 500 });
    }
  }

  const update: Record<string, unknown> = {
    status: action === 'approve' ? 'Approved' : 'Rejected',
    site_id: action === 'approve' ? siteId ?? null : requestRow.site_id,
    decided_by: auth.user?.id ?? null,
    decided_at: new Date().toISOString(),
  };

  const { error: updateError } = await admin
    .from('site_incharge_requests')
    .update(update)
    .eq('id', requestId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: update.status }, { status: 200 });
}