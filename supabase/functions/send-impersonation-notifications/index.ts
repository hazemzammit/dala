/**
 * supabase/functions/send-impersonation-notifications/index.ts
 *
 * Doc 04 §4.3.3a step 6 — scheduled job (run on a cron, e.g. every 15
 * minutes) that sends the org-owner "an admin accessed your account"
 * email for any due row in `impersonation_notifications` (migration
 * 0023). Wraps its run in `scheduled_job_runs`, matching every other
 * scheduled job in this codebase (Doc 01 §1.13) — "No job fails silently."
 *
 * Due = send_after <= now() and sent_at is null. Normal case: send_after
 * was set to session-end time, so this picks it up on the very next run.
 * "Urgent" case: send_after is 24h out, so this correctly skips it until
 * that window passes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { escapeHtml, sendEmail } from '../_shared/resend.ts';
import { requireInternalCaller } from '../_shared/internalAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Internal-only (cron): this reads org-owner emails and sends "an admin
  // accessed your account" notices with the service role. It had NO caller
  // check at all — same bug class already fixed in 0026's other cron
  // functions (rotate-totp-encryption-key, generate-subscription-charges,
  // send-digest-notifications, send-announcement-notifications), just missed
  // here. Any signed-in user's JWT satisfies the platform's default
  // verify_jwt gate, so any user could have triggered this early / spammed it.
  const denied = await requireInternalCaller(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: jobRun } = await supabase
    .from('scheduled_job_runs')
    .insert({ job_name: 'send_impersonation_notifications' })
    .select('id')
    .single();

  let sentCount = 0;
  let errorMessage: string | null = null;

  try {
    const { data: due, error } = await supabase
      .from('impersonation_notifications')
      .select(
        'id, org_id, reason, session_ended_at, admin_id, impersonated_user_id, organizations(name), platform_admins(full_name)',
      )
      .lte('send_after', new Date().toISOString())
      .is('sent_at', null);

    if (error) throw error;

    for (const notification of due ?? []) {
      // The org OWNER receives this, not the impersonated user themselves
      // (§4.3.3a step 6 says "the org owner") — look up who that is for
      // this specific org rather than assuming the impersonated user is
      // the owner (they frequently aren't — a manager or worker can be
      // impersonated too).
      const { data: ownerMembership } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('org_id', notification.org_id)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();

      if (!ownerMembership) {
        console.warn(
          `[send-impersonation-notifications] no owner found for org ${notification.org_id}, skipping`,
        );
        continue;
      }

      const { data: ownerAuthUser } = await supabase.auth.admin.getUserById(
        ownerMembership.user_id,
      );
      const ownerEmail = ownerAuthUser?.user?.email;
      if (!ownerEmail) {
        console.warn(
          `[send-impersonation-notifications] owner ${ownerMembership.user_id} has no email, skipping`,
        );
        continue;
      }

      // Escaped at interpolation: org name is owner-set free text; reason is an
      // admin-typed free-text field. Neither is something the RECIPIENT chose,
      // so neither is trusted to already be safe HTML (see _shared/resend.ts).
      const orgName = escapeHtml((notification as any).organizations?.name ?? 'votre organisation');
      const dateStr = new Date(notification.session_ended_at).toLocaleString('fr-FR');
      const reason = escapeHtml(notification.reason);

      await sendEmail({
        to: ownerEmail,
        subject: `Accès administrateur à votre compte Dala — ${orgName}`,
        html: `<p>Un membre de l'équipe Dala a accédé à votre compte le ${dateStr} pour la raison suivante : ${reason}.</p>`,
      });

      await supabase
        .from('impersonation_notifications')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', notification.id);

      sentCount += 1;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (jobRun) {
    await supabase
      .from('scheduled_job_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: errorMessage ? 'failed' : 'success',
        error_message: errorMessage,
      })
      .eq('id', jobRun.id);
  }

  return new Response(JSON.stringify({ sent: sentCount, error: errorMessage }), {
    status: errorMessage ? 500 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
