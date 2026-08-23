// supabase/functions/send-organization-invitation-email/index.ts
//
// Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.22
// Ref: migration 0030 (organization_member_invitations, invite_organization_member)
//
// Phase 10 — closes the gap 0030 left open: invite_organization_member (0030)
// creates the invitation row and token but never sent anything. This is the
// piece that actually delivers it, called by team-members.tsx right after
// that RPC succeeds (both on first invite and on resend).
//
// Deliberately NOT the same shape as accept-organization-invitation (which
// exists to let an uninvited-yet person WITHOUT a session create an
// account). This function is the opposite direction — an already-
// authenticated OWNER asking to notify someone else — so it authenticates
// the caller normally (forwarded JWT) rather than treating the invitation
// token itself as the identity proof.
//
// Provider: Resend, via the existing _shared/resend.ts helper — already
// wired up and used by forgot-password/sign-up/digest emails. There was no
// undecided-provider blocker here (unlike the worker-invite WhatsApp/SMS
// gap this deliberately does NOT resolve — that's still blocked on a
// provider decision that hasn't been made).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { withInvocationLog } from '../_shared/logInvocation.ts';
import { sendEmail } from '../_shared/resend.ts';

Deno.serve(
  withInvocationLog('send-organization-invitation-email', async (req, ctx) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return jsonResponse({ error: 'Authentification requise.' }, 401);
      }

      const { invitation_id } = (await req.json()) ?? {};
      if (!invitation_id || typeof invitation_id !== 'string') {
        return jsonResponse({ error: 'invitation_id requis.' }, 400);
      }

      // Caller-scoped client (anon key + forwarded JWT) — used only to
      // resolve identity and role, same pattern as export-org-data. Never
      // used to read the invitation row itself, so this can't be tricked
      // into confirming an invitation exists for an org the caller isn't in.
      const callerClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } },
      );

      const {
        data: { user },
      } = await callerClient.auth.getUser();
      if (!user) {
        return jsonResponse({ error: 'Session invalide.' }, 401);
      }

      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      const { data: invitation, error: invitationError } = await admin
        .from('organization_member_invitations')
        .select('id, org_id, invited_email, role, token, status')
        .eq('id', invitation_id)
        .maybeSingle();

      if (invitationError || !invitation) {
        return jsonResponse({ error: 'Invitation introuvable.' }, 404);
      }

      ctx.orgId = invitation.org_id;

      // Owner-only, matching organization_member_invitations_insert_owner
      // (0030) — the caller must currently own the SAME org the invitation
      // belongs to, checked via the caller-scoped client so this respects
      // RLS exactly like every other authenticated request, not just trusts
      // a client-supplied org_id.
      const { data: membership } = await callerClient
        .from('organization_members')
        .select('role')
        .eq('org_id', invitation.org_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership || membership.role !== 'owner') {
        return jsonResponse({ error: 'Réservé au propriétaire.' }, 403);
      }

      if (invitation.status !== 'pending') {
        // Not fatal to the caller's flow (the invite row itself is fine) —
        // just nothing to send. Mirrors accept-organization-invitation's
        // already_accepted handling: a stale double-click, not an error.
        return jsonResponse({ error: 'not_pending' }, 409);
      }

      const { data: org } = await admin
        .from('organizations')
        .select('name')
        .eq('id', invitation.org_id)
        .maybeSingle();

      const orgName = org?.name ?? 'votre organisation';
      const roleLabel = invitation.role === 'manager' ? 'Manager' : 'Observateur';

      // Mobile-only deep link (dala:// scheme, app.json) — matches what
      // accept-organization-invite.tsx already expects. No web fallback URL:
      // this invite flow is mobile-contractor territory per Doc 03 §3.22,
      // and apps/web has no equivalent accept page today (out of scope for
      // this delivery — that's the collaborator's side, flagging rather than
      // inventing a web route here). A recipient without the app installed
      // will need it installed before the link resolves; a universal-link
      // fallback is a real follow-up, not silently assumed solved.
      const acceptUrl = `dala://accept-organization-invite?token=${invitation.token}`;

      await sendEmail({
        to: invitation.invited_email,
        subject: `Invitation à rejoindre ${orgName} sur Dala`,
        html: `
        <p>Vous avez été invité(e) à rejoindre <strong>${orgName}</strong> sur Dala en tant que <strong>${roleLabel}</strong>.</p>
        <p><a href="${acceptUrl}">Accepter l'invitation</a></p>
        <p>Ce lien nécessite l'application Dala installée sur votre téléphone. Il expire dans 7 jours.</p>
        <p>Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer cet e-mail.</p>
      `,
      });

      return jsonResponse({ success: true }, 200);
    } catch (err) {
      console.error('[send-organization-invitation-email] unexpected error', err);
      return jsonResponse({ error: 'Une erreur inattendue est survenue.' }, 500);
    }
  }),
);

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
