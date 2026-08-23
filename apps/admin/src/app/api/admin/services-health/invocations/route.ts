/**
 * Doc 06 §6.3 — Edge Function invocation log (migration 0057). Every row
 * comes from _shared/logInvocation.ts wrapping a user-triggered function's
 * handler; scheduled_job_runs (cron-invoked jobs) is a separate table with
 * its own route (api/admin/services-health/route.ts) — this is not a
 * replacement for that, it's the other half.
 *
 * Pagination: hand-rolled limit/offset here rather than adopting a shared
 * DataTable pagination pattern — that's Tier 4.1's job (Organizations/
 * Users pagination, not built as of this route), and this predates it. A
 * future pass can retrofit this route onto whatever 4.1 lands on; no
 * client of this route depends on the exact shape of `page`/`pageSize`
 * staying hand-rolled forever.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const functionName = searchParams.get('functionName');
  const status = searchParams.get('status');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    200,
    Math.max(
      1,
      Number(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE,
    ),
  );
  const offset = (page - 1) * pageSize;

  const supabase = getAdminSupabaseClient();
  let query = supabase
    .from('edge_function_invocations')
    .select('*', { count: 'exact' })
    .order('invoked_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (functionName) query = query.eq('function_name', functionName);
  if (status === 'success' || status === 'error') query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    invocations: data ?? [],
    page,
    pageSize,
    total: count ?? 0,
  });
}
