/**
 * apps/admin/src/app/api/admin/feature-flags/[key]/route.ts
 *
 * Doc 01 §1.13, admin remediation Tier 4.10. PATCH toggles
 * default_enabled (or updates the description); DELETE removes the flag
 * entirely (cascades to organization_feature_flags via the FK). Both
 * Super Admin + Admin, same tier as the create route.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function PATCH(request: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const supabase = getAdminSupabaseClient();
  const { data: existing } = await supabase
    .from('feature_flags')
    .select('key, default_enabled')
    .eq('key', params.key)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.defaultEnabled === 'boolean') update.default_enabled = body.defaultEnabled;
  if (typeof body?.description === 'string' && body.description.trim()) {
    update.description = body.description.trim();
  }

  const { data: updated, error } = await supabase
    .from('feature_flags')
    .update(update)
    .eq('key', params.key)
    .select('key, description, default_enabled, updated_at')
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: error?.message ?? 'Mise à jour impossible.' },
      { status: 500 },
    );
  }

  await logAdminAction(ctx, 'feature_flag.update', {
    targetTable: 'feature_flags',
    metadata: { key: params.key, before: existing.default_enabled, after: updated.default_enabled },
  });

  return NextResponse.json({ ok: true, flag: updated });
}

export async function DELETE(_request: Request, props: { params: Promise<{ key: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const supabase = getAdminSupabaseClient();
  await supabase.from('feature_flags').delete().eq('key', params.key);

  await logAdminAction(ctx, 'feature_flag.delete', {
    targetTable: 'feature_flags',
    metadata: { key: params.key },
  });

  return NextResponse.json({ ok: true });
}
