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
    .from('worker_change_requests')
    .select('id, request_type, worker_id, site_id, payload, status')
    .eq('id', requestId)
    .maybeSingle();

  if (fetchError || !requestRow) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }

  if (requestRow.status !== 'Pending') {
    return NextResponse.json({ error: 'Request has already been decided' }, { status: 400 });
  }

  // Supervisors may only approve requests for their own site.
  if (auth.isSupervisor) {
    const { data: site } = await admin
      .from('sites')
      .select('id')
      .eq('id', requestRow.site_id ?? '')
      .eq('supervisor_id', auth.user?.id)
      .maybeSingle();
    if (!site) {
      return NextResponse.json(
        { error: 'You can only approve requests for a site you supervise' },
        { status: 403 }
      );
    }
  }

  if (action === 'approve') {
    if (requestRow.request_type === 'add') {
      const payload = (requestRow.payload ?? {}) as Record<string, unknown>;
      if (!payload.name || !payload.trade) {
        return NextResponse.json({ error: 'Request payload is missing worker details' }, { status: 400 });
      }

      const { data: codeData, error: codeError } = await admin.rpc('generate_worker_code');
      if (codeError) {
        return NextResponse.json({ error: codeError.message }, { status: 500 });
      }

      const { error: insertError } = await admin.from('workers').insert({
        worker_code: codeData as string,
        name: payload.name,
        mobile: payload.mobile ?? null,
        address: payload.address ?? null,
        aadhaar: payload.aadhaar ?? null,
        trade: payload.trade,
        daily_wage: payload.daily_wage ?? null,
        pf_percentage: payload.pf_percentage ?? null,
        joining_date: payload.joining_date ?? null,
        site_id: requestRow.site_id,
        working_place: payload.working_place ?? null,
        work_type: payload.work_type ?? null,
        working_since: payload.working_since ?? null,
        is_temporary: payload.is_temporary ?? false,
        bank_name: payload.bank_name ?? null,
        account_number: payload.account_number ?? null,
        ifsc: payload.ifsc ?? null,
        branch: payload.branch ?? null,
        status: payload.status ?? 'Active',
        photo_url: null,
      });
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    } else if (requestRow.request_type === 'delete') {
      if (!requestRow.worker_id) {
        return NextResponse.json({ error: 'Request has no worker to delete' }, { status: 400 });
      }
      const { error: deleteError } = await admin
        .from('workers')
        .delete()
        .eq('id', requestRow.worker_id);
      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    }
  }

  const { error: updateError } = await admin
    .from('worker_change_requests')
    .update({
      status: action === 'approve' ? 'Approved' : 'Rejected',
      decided_by: auth.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, status: action === 'approve' ? 'Approved' : 'Rejected' },
    { status: 200 }
  );
}