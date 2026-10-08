// supabase/functions/sign-up/index.ts
//
// Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.3
//
// Why this is a server-side function and not a client-side supabase-js call:
// email confirmation is required (Doc 01 §1.3.2), so `auth.signUp()` returns
// no session until the link is clicked — the client is never authenticated
// at the moment the organization needs to be created. This function uses the
// service role to do the whole "create user + org + owner membership" step
// as one atomic-enough sequence (see the manual rollback below), matching
// the spec's "on success, a transaction creates..." wording.
//
// NOTE: input validation here intentionally duplicates the shape of
// @dala/validation's signUpSchema rather than importing it — Edge Functions
// deploy as an isolated Deno bundle and reaching across the workspace
// boundary into a pnpm-managed TS package is fragile across deploys. If
// signUpSchema changes, update the shape check below to match.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { enforceRateLimits, extractClientIp } from '../_shared/rateLimit.ts';
import { escapeHtml, sendEmail } from '../_shared/resend.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      full_name,
      email,
      password,
      phone,
      organization_name,
      trade_type,
      // Phase 4 (Doc 02 §2.8) — set only when this sign-up was reached via
      // an org-to-org invite deep link for a contact with no account yet.
      // Both optional; ordinary sign-up is unaffected when absent.
      org_invite_token,
      org_invite_budget_rollup_opt_in,
    } = body ?? {};

    if (!full_name || !email || !password || !phone || !organization_name) {
      return jsonResponse({ error: 'Champs requis manquants.' }, 400);
    }
    if (String(password).length < 10) {
      return jsonResponse({ error: 'Le mot de passe doit contenir au moins 10 caractères.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Throttle sign-ups per IP and per e-mail. The comment further down assumed Supabase's own
    // rate limiting covers this endpoint — it does not: generateLink() below goes through the
    // ADMIN API with the service role, which bypasses Auth's platform limits, so this function
    // could be used to mass-create accounts + organisations and to send unlimited confirmation
    // e-mails to any address. Fails OPEN (a limiter outage must not block real sign-ups).
    const gate = await enforceRateLimits(
      admin,
      [
        { key: `sign-up:ip:${extractClientIp(req)}`, max: 5 },
        { key: `sign-up:email:${String(email).toLowerCase().trim()}`, max: 3 },
      ],
      60 * 60,
    );
    if (!gate.allowed) {
      return jsonResponse({ error: 'Trop de tentatives. Réessayez plus tard.' }, 429);
    }

    // Doc 01 §1.3.3 step 2+4: creates the (unconfirmed) auth.users row and
    // returns a signed, time-limited confirmation link in one call — the
    // handle_new_auth_user trigger (migration 0002) creates the matching
    // profiles row automatically from this same metadata.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'signup',
      email,
      password,
      options: { data: { full_name, phone } },
    });

    if (linkError || !linkData?.user) {
      // (Rate limiting: enforced above via check_rate_limit — NOT by Supabase Auth, see the
      // comment there.) A duplicate-email error surfaces
      // here as a normal validation message (sign-up, unlike forgot-password,
      // isn't required to hide whether an email is already registered).
      const message = linkError?.message?.includes('already registered')
        ? 'Un compte existe déjà avec cet e-mail.'
        : (linkError?.message ?? 'Impossible de créer le compte.');
      return jsonResponse({ error: message }, 400);
    }

    const userId = linkData.user.id;
    // Doc 01 §1.3.3 step 3: organizations + organization_members(role=owner)
    // in the same transaction as user creation. Service role bypasses RLS
    // here deliberately — this is the one place in the codebase allowed to,
    // because it's server-only code, not a client-reachable insert.
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .insert({ name: organization_name, trade_type: trade_type ?? null, created_by: userId })
      .select('id')
      .single();

    if (orgError) {
      console.error('[sign-up] organizations insert failed', orgError);
      // Best-effort rollback: don't leave an orphaned auth user if the org
      // half of the "transaction" fails. Not a real DB transaction (auth.users
      // lives in a separate service from the rest of the schema), so this is
      // a compensating action, not atomicity — worth knowing if this ever
      // needs a stronger guarantee later.
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: "Impossible de créer l'entreprise." }, 500);
    }

    const { error: memberError } = await admin
      .from('organization_members')
      .insert({ org_id: org.id, user_id: userId, role: 'owner' });

    if (memberError) {
      await admin.from('organizations').delete().eq('id', org.id);
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ error: "Impossible de finaliser l'inscription." }, 500);
    }

    await admin.from('profiles').update({ active_org_id: org.id }).eq('id', userId);

    // Phase 4 (Doc 02 §2.8) — no-account invite path. The invite screen
    // (accept-org-invite.tsx) sent the person here instead of calling
    // accept_project_invitation directly, precisely because that RPC
    // requires auth.uid() and this person had no account yet. Now that the
    // org exists, do the equivalent activation with the service role —
    // same reasoning as accept-worker-invitation using service role instead
    // of an RLS-gated RPC, and non-fatal on failure for the same reason
    // that function's invitation-status-update is non-fatal: the account
    // and organization both succeeded, which is what actually lets the
    // person use the app; a failed invite-attach is worth logging, not
    // worth rolling back a successful sign-up over.
    if (org_invite_token) {
      const { data: invitation, error: invitationError } = await admin
        .from('project_invitations')
        .select('id, project_id, status, expires_at')
        .eq('token', org_invite_token)
        .maybeSingle();

      if (invitationError || !invitation) {
        console.error('[sign-up] org_invite_token lookup failed', invitationError);
      } else if (invitation.status === 'accepted') {
        console.error('[sign-up] org_invite_token already accepted, skipping attach');
      } else if (new Date(invitation.expires_at).getTime() < Date.now()) {
        console.error('[sign-up] org_invite_token expired, skipping attach');
      } else {
        const { error: membershipError } = await admin.from('project_memberships').insert({
          project_id: invitation.project_id,
          org_id: org.id,
          role: 'trade',
          budget_rollup_opt_in: Boolean(org_invite_budget_rollup_opt_in),
        });
        if (membershipError) {
          console.error('[sign-up] project_memberships insert failed', membershipError);
        } else {
          await admin
            .from('project_invitations')
            .update({
              status: 'accepted',
              accepted_at: new Date().toISOString(),
              invited_org_id: org.id,
            })
            .eq('id', invitation.id);
        }
      }
    }

    // Built from hashed_token via our own /auth/confirm route handler, NOT
    // linkData.properties.action_link — action_link points at Supabase's
    // hosted verify endpoint using the older implicit-grant redirect chain,
    // which doesn't compose cleanly with @supabase/ssr's cookie-based
    // session handling. See apps/web/src/app/auth/confirm/route.ts.
    //
    // Always a web link, even for mobile sign-ups: the confirmation email is
    // opened from whatever mail app the user has, which opens links in a
    // regular browser regardless of which app they signed up from. Contrast
    // with forgot-password below, which DOES branch by platform, because
    // resetting a password is something the user does inside the app they're
    // already using, not a one-time inbox click.
    const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:3000';
    const confirmUrl = `${appUrl}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=signup&next=/dashboard`;

    await sendEmail({
      to: email,
      subject: 'Confirmez votre compte Dala',
      html: `
        <p>Bonjour ${escapeHtml(full_name)},</p>
        <p>Confirmez votre adresse e-mail pour activer votre compte Dala :</p>
        <p><a href="${confirmUrl}">Confirmer mon compte</a></p>
        <p>Ce lien expire dans 24 heures.</p>
      `,
    });

    return jsonResponse({ success: true, organization_id: org.id }, 200);
  } catch (err) {
    console.error('[sign-up] unexpected error', err);
    return jsonResponse({ error: 'Une erreur inattendue est survenue.' }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

