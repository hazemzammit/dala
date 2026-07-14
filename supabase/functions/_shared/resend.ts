/**
 * supabase/functions/_shared/resend.ts
 *
 * Thin wrapper around Resend's HTTP API. Doc 01 §1.3.3/§1.3.7 both name
 * Resend specifically (not Supabase's built-in SMTP) for auth emails, so
 * every auth Edge Function sends mail through here rather than relying on
 * Supabase Auth's default mailer.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    // Local dev without a Resend key configured: log instead of failing the
    // whole request, so sign-up/reset flows remain testable end-to-end
    // without a real email provider wired up yet.
    console.warn('[resend] RESEND_API_KEY not set — logging email instead of sending.', params);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Dala <no-reply@dala.tn>',
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
}
