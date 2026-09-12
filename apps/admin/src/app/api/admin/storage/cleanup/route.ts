/**
 * Doc 04 §4.3.8 — Storage Monitor's "orphaned-file cleanup action (runs
 * the cleanup_orphaned_files scheduled job on demand)". Runs synchronously,
 * right here — deliberately NOT through a cron/Edge-Function path, since
 * the spec asks for an admin-triggered, on-demand run with an immediate
 * result the admin can see, not a queued job.
 *
 * Implementation note: this route originally called cleanup_orphaned_files()
 * (migration 0051) via RPC, but that function's raw `delete from
 * storage.objects` is rejected by Supabase's own storage-schema guard
 * trigger ("Direct deletion from storage tables is not allowed. Use the
 * Storage API instead.") for EVERY role — postgres included — so the RPC
 * could only ever 500. Same orphan rule as 0051, split in two halves: the
 * DETECTION select runs through the same server-only pg pool every admin
 * route that needs real SQL already uses (reads on storage.objects are
 * untouched by the guard; the CASE-wrapped cast keeps a malformed leading
 * path segment from throwing inside the NOT EXISTS arm), and the DELETION
 * goes through the Storage API exactly as the guard instructs. Response
 * shape and audit action unchanged.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getDbExplorerPool } from '@/lib/db-explorer/pg-client';
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

  // Detection — 0051's orphan rule verbatim: an org-files object whose
  // leading path segment isn't a valid UUID, or whose org row is gone.
  const pool = getDbExplorerPool();
  let orphans: { name: string; size: string }[] = [];
  try {
    const result = await pool.query<{ name: string; size: string }>(
      `select o.name, coalesce((o.metadata ->> 'size')::bigint, 0)::text as size
       from storage.objects o
       where o.bucket_id = 'org-files'
         and (
           (storage.foldername(o.name))[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or not exists (
             select 1 from organizations org
             where org.id = case
               when (storage.foldername(o.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then (storage.foldername(o.name))[1]::uuid
               else null
             end
           )
         )`,
    );
    orphans = result.rows;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Deletion — through the Storage API, per the guard. remove() deletes
  // the backing files and their storage.objects rows together.
  let deletedCount = 0;
  let freedBytes = 0;
  if (orphans.length > 0) {
    const supabase = getAdminSupabaseClient();
    const { error } = await supabase.storage.from('org-files').remove(orphans.map((o) => o.name));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    deletedCount = orphans.length;
    freedBytes = orphans.reduce((sum, o) => sum + Number(o.size), 0);
  }

  await logAdminAction(ctx, 'storage.cleanup_orphaned_files', {
    metadata: { deletedCount, freedBytes },
  });

  return NextResponse.json({ deletedCount, freedBytes });
}
