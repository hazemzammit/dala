/**
 * Doc 04 §4.3.5 — "approval request appears as a pending item on the
 * second admin's own dashboard." Lists every pending request NOT
 * requested by the current admin (an admin can't approve their own
 * request — enforced again server-side in [requestId]/route.ts, this
 * list just doesn't dangle the option in front of them to begin with).
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('admin_approval_requests')
    .select(
      'id, requested_by, sql_statement, reason, status, created_at, platform_admins!requested_by(full_name)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const requests = (data ?? []).map((r: any) => ({
    ...r,
    requested_by_name: r.platform_admins?.full_name ?? r.requested_by,
    canApprove: r.requested_by !== ctx.admin.id,
  }));

  return NextResponse.json({ requests });
}
