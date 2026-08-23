/**
 * apps/admin/src/app/api/admin/feature-flags/route.ts
 *
 * Doc 01 §1.13, admin remediation Tier 4.10. `GET` — any authenticated
 * admin role (Doc 04 §4.3 intro's "Support: read-only everywhere").
 * `POST` (create a new flag) — Super Admin + Admin, same tier as
 * app-versions' write action (Tier 2.5) — an operational/rollout lever,
 * not a destructive-data action, so no typed confirmation.
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
    .from('feature_flags')
    .select('key, description, default_enabled, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flags: data ?? [] });
}

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';
  const defaultEnabled = body?.defaultEnabled === true;

  if (!/^[a-z][a-z0-9_]*$/.test(key)) {
    return NextResponse.json(
      { error: 'La clé doit être en snake_case (ex: nouveau_tableau_de_bord).' },
      { status: 400 },
    );
  }
  if (!description) return NextResponse.json({ error: 'Description requise.' }, { status: 400 });

  const supabase = getAdminSupabaseClient();
  const { data: flag, error } = await supabase
    .from('feature_flags')
    .insert({ key, description, default_enabled: defaultEnabled })
    .select('key, description, default_enabled, created_at, updated_at')
    .single();

  if (error || !flag) {
    return NextResponse.json(
      {
        error:
          error?.code === '23505'
            ? 'Cette clé existe déjà.'
            : (error?.message ?? 'Création impossible.'),
      },
      { status: error?.code === '23505' ? 409 : 500 },
    );
  }

  await logAdminAction(ctx, 'feature_flag.create', {
    targetTable: 'feature_flags',
    metadata: { key, defaultEnabled },
  });

  return NextResponse.json({ ok: true, flag });
}
