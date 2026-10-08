// supabase/functions/mfa-recover/index.ts
//
// Phase 8 — Doc 01 §1.15 lost-authenticator recovery.
//
// Deliberately does NOT try to fake an aal2 session using a recovery code.
// Supabase's own MFA model only ever elevates a session to aal2 through a
// verified TOTP challenge — there's no supported way to hand a client an
// aal2 session from anywhere else, and trying to fake one would undermine
// exactly the property (a server-issued assurance claim, not a client-side
// promise) that's the whole reason Phase 8 chose native MFA over a custom
// column in the first place (see migration 0029's header).
//
// So a recovery code does something more honest instead: it verifies the
// account (password) and the code (single-use, hashed), then DISABLES 2FA
// entirely (removes every verified TOTP factor via the admin API) and hands
// back a normal aal1 session — the same as if 2FA had never been enrolled.
// The user is fully logged in again immediately, with a clear message that
// 2FA was turned off and they should re-enroll from Security settings if
// they want it back on. This is a real security trade-off (a correct
// recovery code fully disables 2FA, it doesn't just grant one-time entry)
// and is disclosed as such rather than silently assumed to be "just as
// secure as the real thing."
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { withInvocationLog } from '../_shared/logInvocation.ts';
import { enforceRateLimits, extractClientIp } from '../_shared/rateLimit.ts';

const WINDOW_SECONDS = 15 * 60;

Deno.serve(
  withInvocationLog('mfa-recover', async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    try {
      const { email, password, recovery_code } = await req.json();
      if (!email || !password || !recovery_code) {
        return jsonResponse({ error: 'Champs manquants.' }, 400);
      }

      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      // Throttle BEFORE any credential is checked. This endpoint is a password oracle (Step 1) and
      // a recovery-code guessing surface (Step 2) with no limit of its own — signInWithPassword
      // through the anon client is only bounded per IP by Supabase Auth. Per-email + per-IP,
      // FAIL CLOSED: if the limiter is down, guessing must not become unlimited.
      const ip = extractClientIp(req);
      const gate = await enforceRateLimits(
        admin,
        [
          { key: `mfa-recover:email:${String(email).toLowerCase().trim()}`, max: 8 },
          { key: `mfa-recover:ip:${ip}`, max: 20 },
        ],
        WINDOW_SECONDS,
        { failOpen: false },
      );
      if (!gate.allowed) {
        return jsonResponse(
          {
            error:
              gate.reason === 'rate_limited'
                ? 'Trop de tentatives. Réessayez dans quelques minutes.'
                : 'Service momentanément indisponible. Réessayez dans un instant.',
          },
          gate.reason === 'rate_limited' ? 429 : 503,
        );
      }

      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
      );

      // Step 1 — verify the password. This succeeds even with a TOTP factor
      // enrolled (Supabase issues the session at aal1 regardless; a pending
      // aal2 challenge is a client-side concern, not a login-rejection one —
      // see migration 0029's header for why that's true by design).
      const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError || !signInData.user) {
        return jsonResponse({ error: 'E-mail ou mot de passe incorrect.' }, 401);
      }

      // Step 2 (code guesses are limited per USER as well — tighter than the email/IP gate above,
      // because a valid password is already in hand at this point).
      const codeGate = await enforceRateLimits(
        admin,
        [{ key: `mfa-recover:user:${signInData.user.id}`, max: 5 }],
        WINDOW_SECONDS,
        { failOpen: false },
      );
      if (!codeGate.allowed) {
        return jsonResponse(
          {
            error:
              codeGate.reason === 'rate_limited'
                ? 'Trop de tentatives. Réessayez dans quelques minutes.'
                : 'Service momentanément indisponible. Réessayez dans un instant.',
          },
          codeGate.reason === 'rate_limited' ? 429 : 503,
        );
      }

      // Step 2 — verify + consume the recovery code (migration 0029's
      // service-role-only RPC; single-use, marked used_at on match).
      const { data: codeValid, error: codeError } = await admin.rpc(
        'verify_and_consume_recovery_code',
        { p_user_id: signInData.user.id, p_code: String(recovery_code).toUpperCase().trim() },
      );
      if (codeError || !codeValid) {
        return jsonResponse({ error: 'Code de récupération invalide ou déjà utilisé.' }, 401);
      }

      // Step 3 — disable 2FA: remove every verified TOTP factor for this
      // user via the admin API (the only way to remove a factor without
      // already holding an aal2 session, which is exactly the case here).
      const { data: factorsData } = await admin.auth.admin.mfa.listFactors({
        userId: signInData.user.id,
      });
      for (const factor of factorsData?.factors ?? []) {
        await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: signInData.user.id });
      }

      return jsonResponse(
        {
          session: signInData.session,
          message:
            "L'authentification à deux facteurs a été désactivée sur ce compte. Réactivez-la depuis Sécurité si vous le souhaitez.",
        },
        200,
      );
    } catch {
      return jsonResponse({ error: 'Une erreur est survenue.' }, 500);
    }
  }),
);

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
