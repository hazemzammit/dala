/**
 * Server-side session guard — used at the top of every route handler and
 * every (admin) server component/page that needs to know who's logged in.
 *
 * Two layers, matching the design decision in the build guide:
 *  1. `middleware.ts` already verified the JWT's signature/expiry (fast,
 *     edge-safe, no DB round-trip) before the request got this far.
 *  2. This function re-checks against the `admin_sessions` DB row, which is
 *     the actual source of truth for revocation and impersonation state —
 *     a JWT can still be cryptographically valid after a `revoked_at` is
 *     set (logout, forced revoke), so the DB check is not optional.
 */
import { cookies } from 'next/headers';

import { SESSION_COOKIE, verifySessionToken } from './admin-session';
import { getAdminSupabaseClient } from './supabase/admin-client';

export interface AdminSessionContext {
  admin: {
    id: string;
    full_name: string;
    role: 'super_admin' | 'admin' | 'support';
  };
  session: {
    id: string;
    impersonating_user_id: string | null;
    impersonation_org_id: string | null;
    impersonation_reason: string | null;
    impersonation_expires_at: string | null;
    impersonation_urgent: boolean;
  };
}

/** Returns null (never throws) when there's no valid session — callers
 * decide whether that means a 401 JSON response or a redirect. */
export async function getAdminSessionContext(): Promise<AdminSessionContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const supabase = getAdminSupabaseClient();
  const { data: session } = await supabase
    .from('admin_sessions')
    .select(
      'id, admin_id, expires_at, revoked_at, impersonating_user_id, impersonation_org_id, impersonation_reason, impersonation_expires_at, impersonation_urgent',
    )
    .eq('id', payload.sessionId)
    .maybeSingle();

  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at as string) < new Date()) return null;
  if (
    session.impersonation_expires_at &&
    new Date(session.impersonation_expires_at as string) < new Date()
  ) {
    // Impersonation sub-session lapsed (15-min idle or 2h hard cap) — the
    // admin's own session can continue, but impersonation state is cleared.
    await supabase
      .from('admin_sessions')
      .update({
        impersonating_user_id: null,
        impersonation_org_id: null,
        impersonation_reason: null,
        impersonation_started_at: null,
        impersonation_expires_at: null,
        impersonation_urgent: false,
      })
      .eq('id', session.id as string);
    session.impersonating_user_id = null;
    session.impersonation_org_id = null;
    session.impersonation_reason = null;
  }

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id, full_name, role')
    .eq('id', session.admin_id as string)
    .maybeSingle();

  if (!admin) return null;

  // Bump last_active_at — used for the impersonation idle timeout, and
  // generally useful for "last seen" without a separate write path.
  await supabase
    .from('admin_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', session.id as string);

  return {
    admin: admin as AdminSessionContext['admin'],
    session: {
      id: session.id as string,
      impersonating_user_id: (session.impersonating_user_id as string | null) ?? null,
      impersonation_org_id: (session.impersonation_org_id as string | null) ?? null,
      impersonation_reason: (session.impersonation_reason as string | null) ?? null,
      impersonation_expires_at: (session.impersonation_expires_at as string | null) ?? null,
      impersonation_urgent: Boolean(session.impersonation_urgent),
    },
  };
}
