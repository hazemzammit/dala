/**
 * Shared audit-logging helper — Doc 04 §4.3.6 / §4.3.3a step 7.
 *
 * Every non-read admin action should go through this, not a one-off insert,
 * so impersonation tagging (admin_id + impersonated_user_id) is applied
 * consistently instead of being re-implemented per screen. Doc 04 §4.3.3a
 * step 7: impersonated actions must be tagged with BOTH ids — this helper
 * makes that the only path, not a convention someone can forget.
 */
import type { AdminSessionContext } from './require-admin-session';
import { getAdminSupabaseClient } from './supabase/admin-client';

export async function logAdminAction(
  ctx: AdminSessionContext,
  action: string,
  opts: { targetTable?: string; targetId?: string; metadata?: Record<string, unknown> } = {},
) {
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.from('audit_log').insert({
    actor_id: ctx.admin.id,
    actor_type: 'platform_admin',
    action,
    target_table: opts.targetTable ?? null,
    target_id: opts.targetId ?? null,
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
