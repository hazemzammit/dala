// supabase/functions/accept-worker-invitation/index.ts
//
// Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.8
// Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.4
//
// Same reason this has to be a server-side function as sign-up/index.ts: the
// worker has no session at all yet, so account creation + linking the
// `workers` row can't happen under RLS from the client. Service role does
// the whole "create auth user + set workers.user_id + mark invitation
// accepted" sequence, with the same manual-rollback caveat as sign-up (no
// real cross-service transaction between auth.users and the public schema).
//
// Unlike contractor sign-up, there is NO email-verification gate here (Doc
// 01 §1.3.4's rationale, repeated in Doc 03 §3.8): the invite channel itself
// is the identity proof, so the created user is emailConfirm:true from the
// start and the mobile client signs in immediately after this call succeeds.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { checkInviteAcceptRateLimit, extractClientIp } from '../_shared/rateLimit.ts';

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

    // Phase 12 (improvement-plan §10.4) — this function calls
    // admin.auth.admin.createUser() below via a service-role client,
    // which bypasses Supabase Auth's own platform rate limits entirely
    // (those only cover the public GoTrue endpoints, not admin.createUser).
    // See migration 0077's own Part 1 header for the full investigation.
    // 10/hour per token (a legitimate retry after a typo'd password),
    // 20/hour per IP (bounds how many different tokens one source can
    // hammer). Checked BEFORE the invitation lookup so a blocked request
    // never even queries worker_invitations.
    const rateLimit = await checkInviteAcceptRateLimit(
      admin,
      {
        functionName: 'accept-worker-invitation',
        maxPerToken: 10,
        maxPerIp: 20,
        windowSeconds: 3600,
      },
      String(invitation_token),
      extractClientIp(req),
    );
    if (!rateLimit.allowed) {
      return jsonResponse({ error: 'Trop de tentatives. Réessayez plus tard.' }, 429);
    }

    const { data: invitation, error: invitationError } = await admin
      .from('worker_invitations')
      .select('id, worker_id, status, expires_at')
      .eq('token', invitation_token)
      .maybeSingle();

    if (invitationError || !invitation) {
      return jsonResponse({ error: "Cette invitation n'existe pas ou n'est plus valide." }, 404);
    }
    if (invitation.status === 'accepted') {
      // Doc 03 §3.8 edge case — worker already has an account (re-clicked an
      // old invite). Signal this distinctly so the client routes to Login
      // instead of showing a generic error.
      return jsonResponse({ error: 'already_accepted' }, 409);
    }
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 410);
    }

    const { data: worker, error: workerError } = await admin
      .from('workers')
      .select('id, org_id, full_name, email')
      .eq('id', invitation.worker_id)
      .single();

    if (workerError || !worker?.email) {
      console.error('[accept-worker-invitation] worker lookup failed', workerError);
      return jsonResponse({ error: 'Travailleur introuvable.' }, 500);
    }

    // email_confirm: true — no soft-gate, see file header. user_metadata
    // mirrors what the handle_new_auth_user trigger (migration 0002) expects
    // from a contractor sign-up, so the resulting `profiles` row is shaped
    // identically regardless of which path created the account.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: worker.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: worker.full_name },
    });

    if (createError || !created?.user) {
      const alreadyRegistered = createError?.message?.toLowerCase().includes('already registered');
      if (alreadyRegistered) {
        return jsonResponse({ error: 'already_accepted' }, 409);
      }
      console.error('[accept-worker-invitation] createUser failed', createError);
      return jsonResponse({ error: 'Impossible de créer le compte.' }, 500);
    }

    const userId = created.user.id;

    const { error: linkError } = await admin
      .from('workers')
      .update({ user_id: userId })
      .eq('id', worker.id);

    if (linkError) {
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: 'Impossible de lier le compte au profil travailleur.' }, 500);
    }

    const { error: acceptError } = await admin
      .from('worker_invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);

    if (acceptError) {
      // Non-fatal: the account and the worker link both succeeded, which is
      // what actually matters for the worker to log in. Log it for
      // follow-up rather than rolling back a successful account creation
      // over a status-field write.
      console.error('[accept-worker-invitation] invitation status update failed', acceptError);
    }

    // profiles.active_org_id has no meaning for a worker account (workers
    // don't switch orgs, Doc 00 §0.4), so unlike sign-up this doesn't set it.

    return jsonResponse({ success: true, email: worker.email }, 200);
  } catch (err) {
    console.error('[accept-worker-invitation] unexpected error', err);
    return jsonResponse({ error: 'Une erreur inattendue est survenue.' }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
