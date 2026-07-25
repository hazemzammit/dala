/**
 * Doc 04 §4.3.6 — filterable audit log.
 * Retention policy (90d normal / 1y security events) is enforced by a
 * scheduled cleanup job, not by this read route — this just queries
 * whatever currently exists in the table.
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

  const supabase = getAdminSupabaseClient();
  let query = supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (targetTable) query = query.eq('target_table', targetTable);
  if (actorId) query = query.eq('actor_id', actorId);
  if (action) query = query.ilike('action', `%${action}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entries: data ?? [] });
}
