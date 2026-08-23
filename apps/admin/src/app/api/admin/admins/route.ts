/**
 * Doc 04 §4.3.11 — Admin User Management. Super-Admin-only: list + invite.
 * Invite creates the auth.users row (email invite, no password set by the
 * inviting admin) and a platform_admins row with totp_enabled=false, so the
 * new admin completes TOTP setup on their own first login (§4.3.1 edge case).
 */
import type { PlatformAdminRole } from '@dala/shared-types';
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

function requireSuperAdmin(ctx: Awaited<ReturnType<typeof getAdminSessionContext>>) {
  return ctx?.admin.role === 'super_admin';
}

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('platform_admins')
    .select('id, full_name, role, totp_enabled, last_login_at, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Admin remediation Tier 1.2 — the TOTP-reset row action needs the
  // target admin's exact email for the confirm-typing dialog (same
  // reasoning as api/admin/users/route.ts's own email-merge comment:
  // email lives on auth.users, not platform_admins, and asking the admin
  // to blind-type it via a native prompt() would mean the UI has no
  // string to validate against before the server does). perPage: 1000,
  // same cap users/route.ts already accepts at current scale.
  const { data: authUsersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map<string, string>();
  for (const u of authUsersPage?.users ?? []) {
    if (u.email) emailById.set(u.id, u.email);
  }

  const admins = (data ?? []).map((a) => ({
    ...a,
    email: emailById.get(a.id as string) ?? null,
  }));

  return NextResponse.json({ admins });
}

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!requireSuperAdmin(ctx)) {
    return NextResponse.json({ error: 'R\u00e9serv\u00e9 aux Super Admins.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const role = (body?.role as PlatformAdminRole) ?? 'support';

  if (!email || !fullName) {
    return NextResponse.json({ error: 'email et nom requis' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? 'invite failed' }, { status: 500 });
  }

  const { error: insertError } = await supabase.from('platform_admins').insert({
    id: invited.user.id,
    full_name: fullName,
    role,
    totp_enabled: false,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await logAdminAction(ctx, 'admin.invite', {
    targetTable: 'platform_admins',
    targetId: invited.user.id,
    metadata: { email, role },
  });

  return NextResponse.json({ ok: true });
}
