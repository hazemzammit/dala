/**
 * Doc 04 §4.3.8 — Storage Monitor's "orphaned-file cleanup action (runs
 * the cleanup_orphaned_files scheduled job on demand)". Runs
 * cleanup_orphaned_files() (migration 0051) synchronously, right here —
 * deliberately NOT through a cron/Edge-Function path, since the spec asks
 * for an admin-triggered, on-demand run with an immediate result the
 * admin can see, not a queued job.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function POST() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Doc 04 §4.3 intro — a storage-deleting action is a data change,
  // outside Support's "no data changes" boundary.
  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.rpc('cleanup_orphaned_files');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = Array.isArray(data) ? data[0] : data;
  const deletedCount = result?.deleted_count ?? 0;
  const freedBytes = result?.freed_bytes ?? 0;

  await logAdminAction(ctx, 'storage.cleanup_orphaned_files', {
    metadata: { deletedCount, freedBytes },
  });

  return NextResponse.json({ deletedCount, freedBytes });
}
