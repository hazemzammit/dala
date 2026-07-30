// supabase/functions/accept-organization-invitation/index.ts
//
// Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.22
// Ref: migration 0030 (organization_member_invitations)
//
// No-account path for accepting an org-member invite. Mirrors
// accept-worker-invitation's shape (service role, invite-channel-is-
// identity-proof, no separate email-verification gate) rather than
// sign-up's — deliberately, because unlike sign-up this must NOT create a
// new organization. The person is joining an EXISTING org as
// manager/viewer; 0030's migration header explains why this can't reuse
// either existing invite-accept path as-is.
//
// The already-has-an-account path does NOT go through this function — it
// calls the accept_organization_member_invitation RPC directly (client has
// a session, so ordinary SECURITY DEFINER RPC access is enough, same as
// accept_project_invitation's existing-account path).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { invitation_token, password } = body ?? {};

    if (!invitation_token || !password) {
      return jsonResponse({ error: 'Champs requis manquants.' }, 400);
    }
    if (String(password).length < 10) {
      return jsonResponse({ error: 'Le mot de passe doit contenir au moins 10 caractères.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: invitation, error: invitationError } = await admin
      .from('organization_member_invitations')
      .select('id, org_id, invited_email, role, status, expires_at')
      .eq('token', invitation_token)
      .maybeSingle();

    if (invitationError || !invitation) {
      return jsonResponse({ error: "Cette invitation n'existe pas ou n'est plus valide." }, 404);
    }
    if (invitation.status === 'accepted') {
      // Same edge case as accept-worker-invitation: the person re-clicked an
      // old invite after already accepting. Route to Login, not a generic error.
      return jsonResponse({ error: 'already_accepted' }, 409);
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 410);
    }

    // email_confirm: true — the invite link itself is the identity proof,
    // same reasoning as accept-worker-invitation. full_name isn't known yet
    // (unlike a worker invite, which names the person up front) — left for
    // the person to fill in from profile-settings.tsx after first login,
    // same as any other field profiles.full_name defaults blank for.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: invitation.invited_email,
      password,
      email_confirm: true,
      user_metadata: { full_name: invitation.invited_email.split('@')[0] },
    });

    if (createError || !created?.user) {
      const alreadyRegistered = createError?.message?.toLowerCase().includes('already registered');
      if (alreadyRegistered) {
        // A real account already exists under this email (created some
        // other way after the invite was sent) — this function only ever
        // handles the no-account path, so hand off to the accept RPC
        // instead of failing opaquely.
        return jsonResponse({ error: 'account_exists' }, 409);
      }
      console.error('[accept-organization-invitation] createUser failed', createError);
      return jsonResponse({ error: 'Impossible de créer le compte.' }, 500);
    }

    const userId = created.user.id;

    const { error: memberError } = await admin
      .from('organization_members')
      .insert({ org_id: invitation.org_id, user_id: userId, role: invitation.role });

    if (memberError) {
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: "Impossible de rejoindre l'organisation." }, 500);
    }

    // Unlike a worker account (which never has an active_org_id — workers
    // don't switch orgs, Doc 00 §0.4), this account is a normal
    // owner/manager/viewer-shaped profile, so it needs one set — same as
    // sign-up does for a brand-new organization. This is the person's only
    // org at this point, so it's an unambiguous default.
    await admin.from('profiles').update({ active_org_id: invitation.org_id }).eq('id', userId);

    const { error: acceptError } = await admin
      .from('organization_member_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    if (acceptError) {
      // Non-fatal, same reasoning as accept-worker-invitation: the account
      // and the membership both succeeded, which is what lets the person
      // actually use the app. Log for follow-up, don't roll back a
      // successful account creation over a status-field write.
      console.error(
        '[accept-organization-invitation] invitation status update failed',
        acceptError,
      );
    }

    return jsonResponse({ success: true, email: invitation.invited_email }, 200);
  } catch (err) {
    console.error('[accept-organization-invitation] unexpected error', err);
    return jsonResponse({ error: 'Une erreur inattendue est survenue.' }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
