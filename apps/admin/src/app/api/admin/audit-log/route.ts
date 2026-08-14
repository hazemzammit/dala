/**
 * Doc 04 §4.3.6 — filterable audit log across all six spec-listed
 * dimensions (user/org/action/table/date/IP). org_id and ip_address exist
 * on audit_log as of 0052 (see that migration's header — neither existed
 * before this remediation phase).
 * Retention policy (90d normal / 1y security events) is enforced by
 * cleanup_audit_log_retention(), scheduled daily via pg_cron in 0053 —
 * this route just queries whatever currently exists in the table.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetTable = searchParams.get('table');
  const actorId = searchParams.get('actorId');
  const action = searchParams.get('action');
  const orgId = searchParams.get('orgId');
  const ipAddress = searchParams.get('ipAddress');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const supabase = getAdminSupabaseClient();
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (targetTable) query = query.eq('target_table', targetTable);
  if (actorId) query = query.eq('actor_id', actorId);
  if (action) query = query.ilike('action', `%${action}%`);
  if (orgId) query = query.eq('org_id', orgId);
  if (ipAddress) query = query.eq('ip_address', ipAddress);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}
