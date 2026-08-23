/**
 * Doc 01 §1.8.2 — App version / forced-update control, editable from
 * Platform Admin. Closes a gap that's been literal since 0011: the
 * `app_versions` table (and app_version_check(), the unauthenticated RPC
 * mobile calls on cold start, Doc 03 §3.1a) always existed, but nothing
 * in apps/admin ever wrote to it — killing a bad release required
 * hand-editing the DB directly.
 *
 * GET is read-only and open to every admin role (including Support) —
 * same reasoning as services-health's own GET: seeing the current
 * versions isn't a mutation. POST (the actual "kill a release" lever) is
 * Super Admin + Admin only, not Support — an operational safety lever,
 * not a destructive-data action (no typed-confirmation dialog), but also
 * not something a read-only role should be able to trigger.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('app_versions')
    .select('platform, latest_version, min_supported_version, updated_at')
    .order('platform');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const platform = body?.platform;
  const latestVersion = typeof body?.latestVersion === 'string' ? body.latestVersion.trim() : '';
  const minSupportedVersion =
    typeof body?.minSupportedVersion === 'string' ? body.minSupportedVersion.trim() : '';

  if (platform !== 'ios' && platform !== 'android') {
    return NextResponse.json({ error: 'platform invalide.' }, { status: 400 });
  }
  if (!latestVersion || !minSupportedVersion) {
    return NextResponse.json(
      { error: 'latestVersion et minSupportedVersion sont requis.' },
      { status: 400 },
    );
  }

  const supabase = getAdminSupabaseClient();
  const { data: before } = await supabase
    .from('app_versions')
    .select('latest_version, min_supported_version')
    .eq('platform', platform)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from('app_versions')
    .update({
      latest_version: latestVersion,
      min_supported_version: minSupportedVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('platform', platform)
    .select('platform, latest_version, min_supported_version, updated_at')
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'Mise à jour impossible.' },
      { status: 500 },
    );
  }

  // Doc 04 §4.3.6 / audit_log's own schema (0009) — target_id is typed
  // uuid, but app_versions' primary key is platform (text: 'ios' |
  // 'android'), not a uuid — the only target_table in this whole app
  // where that's true (every other logAdminAction() call site targets a
  // uuid-keyed table). targetId is left unset rather than passing a
  // non-uuid string that Postgres would reject; platform goes in
  // metadata instead, alongside the before/after values.
  await logAdminAction(ctx, 'app_version.update', {
    targetTable: 'app_versions',
    metadata: {
      platform,
      before,
      after: {
        latest_version: latestVersion,
        min_supported_version: minSupportedVersion,
      },
    },
  });

  return NextResponse.json({ ok: true, version: updated });
}
