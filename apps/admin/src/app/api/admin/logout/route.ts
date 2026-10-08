/**
 * Explicit logout: revokes the admin_sessions row (not just clearing the
 * cookie client-side) so a stolen-but-unexpired JWT can't still be used —
 * revocation is checked in lib/require-admin-session.ts against this row.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/admin-session';
import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (payload) {
    // Doc 04 §4.3.6 / 0053's own header — same gap as login (see
    // login/step2/route.ts). getAdminSessionContext() re-reads the
    // session row that's about to be revoked, giving a real, fully-shaped
    // ctx (impersonation state included) to log against — logged BEFORE
    // revoking, per the plan, precisely so this has a valid ctx to use
    // rather than needing the same manual-literal workaround step2
    // needed (there, no ctx could exist yet by construction; here, one
    // already does).
    const ctx = await getAdminSessionContext();
    if (ctx) {
      await logAdminAction(ctx, 'admin.logout', {
        targetTable: 'platform_admins',
        targetId: ctx.admin.id,
      });
    }

    const supabase = getAdminSupabaseClient();
    await supabase
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', payload.sessionId);
  }

  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
