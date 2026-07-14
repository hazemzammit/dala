// supabase/functions/forgot-password/index.ts
//
// Ref: docs/spec/01-data-model-security-and-architecture.md §1.3.7
//
// Server-side because two things here can't be done from the client:
//   1. Checking whether the email exists WITHOUT telling the caller either
//      way (step 2) — requires the service-role-only find_user_id_by_email
//      RPC (migration 0015).
//   2. Writing password_reset_audit (step 3) and enforcing the 3/hour/email
//      rate limit (step 6) against that same table.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/resend.ts';

const GENERIC_RESPONSE = {
  message: 'Si un compte existe pour cet e-mail, nous avons envoyé un lien de réinitialisation.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email } = (await req.json()) ?? {};
    if (!email || typeof email !== 'string') {
      return jsonResponse({ error: 'Adresse e-mail requise.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: userId } = await admin.rpc('find_user_id_by_email', { p_email: email });

    // Step 2: identical response whether or not the account exists — do not
    // return early with a different shape/status for "not found".
    if (!userId) {
      return jsonResponse(GENERIC_RESPONSE, 200);
    }

    // Step 6: 3 requests/hour/email, counted from password_reset_audit
    // directly rather than a separate counter table — this table already
    // has exactly the rows and timestamps needed.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('password_reset_audit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('requested_at', oneHourAgo);

    if ((count ?? 0) >= 3) {
      // Still the generic response — a rate-limit-specific message would
      // itself leak "this email exists and someone's been resetting it,"
      // which is the exact enumeration signal step 2 exists to prevent.
      return jsonResponse(GENERIC_RESPONSE, 200);
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    if (linkError || !linkData) {
      console.error('[forgot-password] generateLink failed', linkError);
      return jsonResponse(GENERIC_RESPONSE, 200); // still generic externally
    }

    const platform = req.headers.get('x-dala-platform') === 'mobile' ? 'mobile' : 'web';

    await admin.from('password_reset_audit').insert({
      user_id: userId,
      platform,
    });

    // Platform-specific link: web opens a normal browser URL; mobile opens
    // a custom-scheme deep link straight back into the app (Expo Router
    // resolves apps/mobile/src/app/auth/confirm.tsx for this — the app must
    // already be installed. A universal-link fallback for "app not
    // installed" is a real gap worth closing before this ships, but is out
    // of scope for this scaffold.)
    const confirmUrl =
      platform === 'mobile'
        ? `dala://auth/confirm?token_hash=${linkData.properties.hashed_token}&type=recovery`
        : `${Deno.env.get('APP_URL') ?? 'http://localhost:3000'}/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reset-password`;

    await sendEmail({
      to: email,
      subject: 'Réinitialisez votre mot de passe Dala',
      html: `
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p><a href="${confirmUrl}">Choisir un nouveau mot de passe</a></p>
        <p>Ce lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
      `,
    });

    return jsonResponse(GENERIC_RESPONSE, 200);
  } catch (err) {
    console.error('[forgot-password] unexpected error', err);
    // Even on an unexpected error, don't leak internals — generic message,
    // 200 status, matching the rest of this endpoint's response shape.
    return jsonResponse(GENERIC_RESPONSE, 200);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
