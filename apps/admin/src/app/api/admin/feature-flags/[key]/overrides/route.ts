/**
 * apps/admin/src/app/api/admin/feature-flags/[key]/overrides/route.ts
 *
 * Doc 01 §1.13, admin remediation Tier 4.10 — the "search-and-override
 * per org" half (the plan's step 4). GET lists existing overrides for
 * this flag; POST sets/clears one for a specific org (clearing = delete
 * the override row, falling back to the flag's default_enabled, not
 * setting enabled to match the default — a cleared override should mean
 * "no longer overridden," which stays correct even if the default
 * changes later).
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET(_request: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('organization_feature_flags')
    .select('org_id, enabled, updated_at, organizations(name)')
    .eq('flag_key', params.key)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const overrides = (data ?? []).map((o) => ({
    org_id: o.org_id,
    org_name: (o as any).organizations?.name ?? '—',
    enabled: o.enabled,
    updated_at: o.updated_at,
  }));

  return NextResponse.json({ overrides });
}

export async function POST(request: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const orgId = body?.orgId;
  const action = body?.action; // 'set' | 'clear'
  const enabled = body?.enabled === true;

  if (!orgId) return NextResponse.json({ error: 'orgId requis.' }, { status: 400 });
  if (action !== 'set' && action !== 'clear') {
    return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();

  if (action === 'clear') {
    await supabase
      .from('organization_feature_flags')
      .delete()
      .eq('org_id', orgId)
      .eq('flag_key', params.key);
  } else {
    const { error } = await supabase
      .from('organization_feature_flags')
      .upsert(
        { org_id: orgId, flag_key: params.key, enabled, updated_at: new Date().toISOString() },
        { onConflict: 'org_id,flag_key' },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAdminAction(ctx, 'feature_flag.override', {
    targetTable: 'organizations',
    targetId: orgId,
    orgId,
    metadata: { flagKey: params.key, action, enabled: action === 'set' ? enabled : undefined },
  });

  return NextResponse.json({ ok: true });
}
