// supabase/functions/send-project-invitation-email/index.ts
//
// Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.8
// Ref: migration 0024 (project_invitations, invite_org_to_project)
//
// Closes the gap `collaboration.tsx`'s own comment names explicitly:
// `invite_org_to_project` creates the `project_invitations` row and token
// but never sends anything — "actual delivery is a notification-dispatch
// concern, not built in this pass." Same scope boundary as team.tsx's
// worker-invite gap, but THIS gap is buildable today and that one isn't:
// 0024's `sent_via` column already accepts `'email'`, and Resend is already
// wired up and proven working for the org-MEMBER invite flow
// (`send-organization-invitation-email`, Phase 10). This function is that
// same shape, for the org-to-org PROJECT invite instead — the
// `whatsapp`/`sms` values stay unimplemented, same disclosed limitation as
// team.tsx's own gap; no provider decision is invented here either.
//
// Mirrors send-organization-invitation-email's structure closely (caller-
// scoped client for identity/role, admin client for the actual row read
// and the org-name lookup, same two-client separation and same reasoning
// for it) — deliberately not reinventing the shape.
//
// Deep link: `dala://accept-org-invite?token=...` — NOT the same route as
// `accept-organization-invite.tsx` (that's the org-MEMBER invite screen).
// This is `accept-org-invite.tsx`, the org-to-org PROJECT invite screen
// (Doc 02 §2.8). See this phase's delivery notes for the three-similarly-
// named-routes awareness note — no bug today, but worth restating here too
// since this function is exactly the kind of place a future edit could
// get the one-word difference wrong.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/resend.ts';

Deno.serve(async (req) => {
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

    // Caller-scoped client (anon key + forwarded JWT) — resolves identity
    // and role only, same separation as send-organization-invitation-email.
    // Never used to read the invitation row itself, so this can't be
    // tricked into confirming an invitation exists for a project the
    // caller's org has no lead role on.
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
      .from('project_invitations')
      .select('id, project_id, lead_org_id, invited_email, trade_type, sent_via, token, status')
      .eq('id', invitation_id)
      .maybeSingle();

    if (invitationError || !invitation) {
      return jsonResponse({ error: 'Invitation introuvable.' }, 404);
    }

    // This function only ever sends the email channel — collaboration.tsx
    // is expected to only invoke it when sent_via === 'email' in the first
    // place, but the check is repeated here rather than trusted from the
    // client, same "never trust the caller for anything security- or
    // correctness-relevant" discipline as every other function in this
    // codebase. whatsapp/sms rows are a no-op here, not an error — the row
    // itself is still valid, there's just nothing this function does with it.
    if (invitation.sent_via !== 'email') {
      return jsonResponse({ error: 'not_email_channel' }, 409);
    }
    if (!invitation.invited_email) {
      return jsonResponse({ error: 'no_invited_email' }, 409);
    }

    // Owner/manager-only, matching invite_org_to_project's (0024) own
    // permission check (`org_role_of(v_lead_org_id) in ('owner','manager')`)
    // — checked via the caller-scoped client so this respects RLS exactly
    // like every other authenticated request here, not a client-supplied
    // org_id trusted at face value.
    const { data: membership } = await callerClient
      .from('organization_members')
      .select('role')
      .eq('org_id', invitation.lead_org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      return jsonResponse({ error: 'Réservé au propriétaire ou manager.' }, 403);
    }

    if (invitation.status !== 'pending') {
      // Not fatal to the caller's flow — mirrors
      // send-organization-invitation-email's own not_pending handling.
      return jsonResponse({ error: 'not_pending' }, 409);
    }

    const [{ data: project }, { data: leadOrg }] = await Promise.all([
      admin.from('projects').select('name').eq('id', invitation.project_id).maybeSingle(),
      admin.from('organizations').select('name').eq('id', invitation.lead_org_id).maybeSingle(),
    ]);

    const projectName = project?.name ?? 'un chantier';
    const leadOrgName = leadOrg?.name ?? 'une entreprise';
    const tradeLabel = invitation.trade_type ? ` en tant que ${invitation.trade_type}` : '';

    // dala:// deep link, mobile-only — same "no web fallback" scope
    // boundary as send-organization-invitation-email, and for the same
    // reason: this is mobile-contractor territory, apps/web has no
    // equivalent accept page today, out of scope here (collaborator's side).
    const acceptUrl = `dala://accept-org-invite?token=${invitation.token}`;

    await sendEmail({
      to: invitation.invited_email,
      subject: `Invitation à collaborer sur ${projectName} — Dala`,
      html: `
        <p><strong>${leadOrgName}</strong> vous invite à collaborer sur le chantier <strong>${projectName}</strong>${tradeLabel} sur Dala.</p>
        <p><a href="${acceptUrl}">Accepter l'invitation</a></p>
        <p>Ce lien nécessite l'application Dala installée sur votre téléphone. Il expire dans 7 jours.</p>
        <p>Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer cet e-mail.</p>
      `,
    });

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error('[send-project-invitation-email] unexpected error', err);
    return jsonResponse({ error: 'Une erreur inattendue est survenue.' }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
