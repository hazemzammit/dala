/**
 * Doc 04 §4.3.3a step 6 — ending an impersonation session enqueues the
 * owner-notification email into `impersonation_notifications` (migration
 * 0023). `send_after` = now() normally, or now()+24h if "Urgent" was
 * checked at start — a scheduled Edge Function
 * (supabase/functions/send-impersonation-notifications) picks up due
 * rows on a cron and actually sends via Resend, matching the
 * scheduled_job_runs pattern the rest of the codebase already uses for
 * delayed/periodic work. This route only enqueues; it never sends
 * synchronously (a 24h delay can't happen inside a request/response
 * cycle).
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const URGENT_DELAY_MS = 24 * 60 * 60 * 1000;

export async function POST() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { impersonating_user_id: impersonatedUserId, impersonation_org_id: orgId } = ctx.session;
  if (!impersonatedUserId || !orgId) {
    return NextResponse.json({ error: 'no_active_impersonation' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();

  const sessionEndedAt = new Date();
  const sendAfter = ctx.session.impersonation_urgent
    ? new Date(sessionEndedAt.getTime() + URGENT_DELAY_MS)
    : sessionEndedAt;

  const { error: notificationError } = await supabase.from('impersonation_notifications').insert({
    admin_id: ctx.admin.id,
    org_id: orgId,
    impersonated_user_id: impersonatedUserId,
    reason: ctx.session.impersonation_reason,
    session_ended_at: sessionEndedAt.toISOString(),
    send_after: sendAfter.toISOString(),
  });

  if (notificationError) {
    // Don't block ending the impersonation session on the notification
    // queue failing — surfaced loudly instead, since a missed owner
    // notification is a real (if secondary) problem worth investigating.
    console.error('[impersonate/end] failed to enqueue owner notification:', notificationError);
  }

  await logAdminAction(ctx, 'admin.impersonate_end', {
    targetTable: 'profiles',
    targetId: impersonatedUserId,
  });

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
    .eq('id', ctx.session.id);

  return NextResponse.json({ ok: true });
}
