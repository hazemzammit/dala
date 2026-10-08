/**
 * Doc 04 §4.3.1 edge case / §4.3.11 — per-admin actions on `platform_admins`.
 * Currently just `reset_totp`: a Super Admin's way to recover another admin
 * who lost their authenticator, by clearing their TOTP enrollment so
 * login/step1's `needsSetup = !admin.totp_enabled` check routes them back
 * through the existing first-login `totp-setup` flow — no new enrollment
 * UI needed, the reset alone is the whole feature.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

type AdminAction = 'reset_totp';

export async function POST(request: Request, props: { params: Promise<{ adminId: string }> }) {
  const params = await props.params;
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Doc 04 §4.3 intro — admin management (this whole route) is Super-Admin
  // only, same tier as api/admin/admins/route.ts's invite action.
  const roleError = requireRole(ctx, ['super_admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const action = body?.action as AdminAction | undefined;

  // An admin cannot reset their own TOTP through this route — that's just
  // normal re-enrollment after disabling it themselves, not the "recover
  // someone else" case this route exists for. Keeping this strictly
  // other-admin-only avoids this becoming an accidental self-service
  // TOTP-disable button with no re-auth step of its own.
  if (params.adminId === ctx.admin.id) {
    return NextResponse.json(
      { error: 'Vous ne pouvez pas réinitialiser votre propre 2FA via cette action.' },
      { status: 400 },
    );
  }

  const supabase = getAdminSupabaseClient();
  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id, full_name')
    .eq('id', params.adminId)
    .maybeSingle();

  if (!admin) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  switch (action) {
    case 'reset_totp':
      await supabase
        .from('platform_admins')
        .update({ totp_secret: null, totp_enabled: false })
        .eq('id', admin.id);
      break;
    default:
      return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  await logAdminAction(ctx, `admin.${action}`, {
    targetTable: 'platform_admins',
    targetId: admin.id as string,
  });

  return NextResponse.json({ ok: true });
}
