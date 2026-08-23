/**
 * apps/admin/src/app/api/admin/sessions/route.ts
 *
 * Doc 04 §4.3.11, admin remediation Tier 4.9. Two audiences sharing one
 * table, per the plan: `GET` is self-service for everyone (a non-Super-
 * Admin only ever sees their OWN sessions — "sign out my other browser"),
 * but a Super Admin sees every admin's sessions across the whole platform
 * (the stolen-laptop/offboarding case genuinely needs that visibility).
 * `POST revoke` mirrors the same split: works on your own session
 * regardless of role, or on ANY session if you're a Super Admin.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  let query = supabase
    .from('admin_sessions')
    .select(
      'id, admin_id, created_at, last_active_at, expires_at, ip_address, impersonating_user_id, platform_admins(full_name, role)',
    )
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('last_active_at', { ascending: false });

  if (ctx.admin.role !== 'super_admin') {
    query = query.eq('admin_id', ctx.admin.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessions = (data ?? []).map((s) => ({
    id: s.id,
    admin_id: s.admin_id,
    admin_name: (s as any).platform_admins?.full_name ?? '—',
    admin_role: (s as any).platform_admins?.role ?? null,
    created_at: s.created_at,
    last_active_at: s.last_active_at,
    expires_at: s.expires_at,
    ip_address: s.ip_address,
    is_impersonating: s.impersonating_user_id != null,
    is_current: s.id === ctx.session.id,
    platform_admins: undefined,
  }));

  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sessionId = body?.sessionId;
  const action = body?.action;

  if (action !== 'revoke') return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  if (!sessionId) return NextResponse.json({ error: 'sessionId requis' }, { status: 400 });

  const supabase = getAdminSupabaseClient();
  const { data: targetSession } = await supabase
    .from('admin_sessions')
    .select('id, admin_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!targetSession) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const isOwnSession = targetSession.admin_id === ctx.admin.id;
  if (!isOwnSession && ctx.admin.role !== 'super_admin') {
    return NextResponse.json(
      { error: "Seul un Super Admin peut révoquer la session d'un autre admin." },
      { status: 403 },
    );
  }

  await supabase
    .from('admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId);

  await logAdminAction(ctx, 'admin.revoke_session', {
    targetTable: 'admin_sessions',
    targetId: sessionId,
    metadata: { targetAdminId: targetSession.admin_id, selfRevoke: isOwnSession },
  });

  return NextResponse.json({ ok: true });
}
