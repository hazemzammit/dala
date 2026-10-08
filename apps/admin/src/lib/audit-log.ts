/**
 * Shared audit-logging helper — Doc 04 §4.3.6 / §4.3.3a step 7.
 *
 * Every non-read admin action should go through this, not a one-off insert,
 * so impersonation tagging (admin_id + impersonated_user_id) is applied
 * consistently instead of being re-implemented per screen. Doc 04 §4.3.3a
 * step 7: impersonated actions must be tagged with BOTH ids — this helper
 * makes that the only path, not a convention someone can forget.
 *
 * 0052 added org_id/ip_address to audit_log for Doc 04 §4.3.6's filters.
 * ip_address is captured here automatically via next/headers — every
 * caller of this function runs inside a Route Handler's request scope, so
 * there's no need to thread the request object through every call site
 * just to log an IP; reuses the exact same x-forwarded-for parsing
 * middleware.ts's IP-allowlist check and login/step1 already use
 * (lib/get-client-ip.ts), so this can never quietly disagree with those
 * on which header entry is "the" client IP. org_id stays opt-in per call
 * site (opts.orgId) since not every action has one true owning org — see
 * 0052's header for why it isn't derived automatically.
 */
import { headers } from 'next/headers';

import { getClientIp } from './get-client-ip';
import type { AdminSessionContext } from './require-admin-session';
import { getAdminSupabaseClient } from './supabase/admin-client';

export async function logAdminAction(
  ctx: AdminSessionContext,
  action: string,
  opts: {
    targetTable?: string;
    targetId?: string;
    orgId?: string;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const supabase = getAdminSupabaseClient();

  let ipAddress: string | null = null;
  try {
    ipAddress = getClientIp(await headers()) || null;
  } catch {
    // headers() throws outside a request scope (e.g. a future cron/script
    // caller) — audit logging shouldn't fail the caller's primary action
    // over a missing IP, so this degrades to null rather than throwing.
    ipAddress = null;
  }

  const { error } = await supabase.from('audit_log').insert({
    actor_id: ctx.admin.id,
    actor_type: 'platform_admin',
    action,
    target_table: opts.targetTable ?? null,
    target_id: opts.targetId ?? null,
    org_id: opts.orgId ?? null,
    ip_address: ipAddress,
    metadata: opts.metadata ?? null,
    // §4.3.3a step 7 — tag with the impersonated user whenever a session is
    // currently impersonating, so the action is traceable back to the admin.
    impersonated_user_id: ctx.session.impersonating_user_id ?? null,
    impersonation_reason: ctx.session.impersonating_user_id
      ? ctx.session.impersonation_reason
      : null,
  });

  if (error) {
    // Audit logging failing silently would be worse than a visible error —
    // surface it rather than swallowing it, but don't block the caller's
    // primary action on it (log-then-continue).
    // eslint-disable-next-line no-console
    console.error('[audit-log] failed to write audit_log row:', error, { action });
  }
}
