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
    // Log only what's needed to see the flow ran (recipient + subject), never the
    // HTML body: several callers embed a password-reset / invitation-accept /
    // magic-link TOKEN directly in the body, and this fallback exists for local
    // dev — but the exact same code path runs if RESEND_API_KEY is ever left
    // unset in a real (staging/shared) environment by mistake, which would
    // otherwise put live, usable tokens into plain log output.
    console.warn('[resend] RESEND_API_KEY not set — logging email instead of sending.', {
      to: params.to,
      subject: params.subject,
    });
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

/**
 * Escapes a string for safe interpolation into an HTML e-mail body.
 *
 * Every `sendEmail({ html: ... })` caller builds its body with a template
 * literal that interpolates free-text database values — organisation names,
 * project names, an admin's typed impersonation reason — that the RECIPIENT
 * did not choose and cannot control. Any of those fields can contain
 * arbitrary HTML (an org name of `<a href="https://evil.example">Your
 * invoice</a>` renders as a clickable link in the invitee's mail client),
 * which is a stored HTML-injection / phishing vector through the platform's
 * own transactional mail. Every such value must be escaped at the point of
 * interpolation; this is NOT applied automatically by sendEmail() itself,
 * since some callers intentionally build the `<strong>`/`<a>` markup around
 * an already-escaped value.
 */
export function escapeHtml(input: string): string {
  return input.replace(
    /[&<>"\']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
