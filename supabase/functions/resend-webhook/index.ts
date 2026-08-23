// supabase/functions/resend-webhook/index.ts
//
// Doc 04 §4.3.9 — email deliverability visibility, admin remediation
// Tier 4.7. Receives Resend's delivery-lifecycle webhooks (sent,
// delivered, delivery_delayed, bounced, complained, opened, clicked) and
// logs each to email_delivery_events (migration 0064).
//
// VERIFICATION — Resend webhooks are Svix-format (verified against
// Resend's current live docs before writing this, per the plan's own
// instruction not to trust potentially-stale general knowledge here):
//   - headers: svix-id, svix-timestamp, svix-signature
//   - secret: RESEND_WEBHOOK_SECRET, format "whsec_<base64>"
//   - signed content: "{svix-id}.{svix-timestamp}.{raw request body}"
//   - signature: HMAC-SHA256(base64-decoded key material, signed content),
//     base64-encoded, compared against one or more space-separated
//     "v1,<base64>" tokens in svix-signature (any match is valid)
//   - replay protection: reject if svix-timestamp is more than 5 minutes
//     from the current time, in either direction
// Implemented with Deno's built-in Web Crypto API (no Svix/Resend SDK
// dependency) — this is a generic, standardized HMAC scheme, not
// Resend-specific, and every other Edge Function in this repo already
// avoids adding SDK dependencies beyond @supabase/supabase-js.
//
// MUST use the raw request body for the signature check — parsing to
// JSON and re-stringifying changes key order/whitespace/number
// formatting and breaks the signature (this is the single most common
// implementation mistake per Resend's/Svix's own docs) — req.text() is
// read once and reused for both verification and parsing below.
//
// "related context if derivable": NOT derivable yet — see migration
// 0064's header for why (no `tags` sent on outgoing mail today).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { withInvocationLog } from '../_shared/logInvocation.ts';

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes, matches Svix's own default

async function verifySvixSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  const timestampNum = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(timestampNum)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampNum);
  if (ageSeconds > REPLAY_WINDOW_SECONDS) return false;

  const keyMaterial = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = Uint8Array.from(atob(keyMaterial), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));

  // svix-signature is space-separated "v1,<base64>" tokens (webhook
  // endpoints can have multiple active signing secrets during rotation) —
  // any token matching is a valid signature.
  const providedTokens = svixSignature.split(' ');
  return providedTokens.some((token) => {
    const [, sig] = token.split(',');
    return sig === expected;
  });
}

Deno.serve(
  withInvocationLog('resend-webhook', async (req) => {
    const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured.');
      return new Response(JSON.stringify({ error: 'Webhook non configuré.' }), { status: 500 });
    }

    const svixId = req.headers.get('svix-id');
    const svixTimestamp = req.headers.get('svix-timestamp');
    const svixSignature = req.headers.get('svix-signature');
    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response(JSON.stringify({ error: 'En-têtes de signature manquants.' }), {
        status: 400,
      });
    }

    // Raw text, read once — reused for both verification (must match
    // byte-for-byte what Resend signed) and parsing below.
    const rawBody = await req.text();

    const valid = await verifySvixSignature(rawBody, svixId, svixTimestamp, svixSignature, secret);
    if (!valid) {
      console.warn('[resend-webhook] signature verification failed.');
      return new Response(JSON.stringify({ error: 'Signature invalide.' }), { status: 401 });
    }

    let event: {
      type: string;
      data: {
        email_id: string;
        to: string[];
        bounce?: { type?: string; message?: string };
      };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Payload JSON invalide.' }), { status: 400 });
    }

    const KNOWN_EVENT_TYPES = new Set([
      'email.sent',
      'email.delivered',
      'email.delivery_delayed',
      'email.bounced',
      'email.complained',
      'email.opened',
      'email.clicked',
    ]);
    if (!KNOWN_EVENT_TYPES.has(event.type)) {
      // A future Resend event type this table's CHECK constraint doesn't
      // yet know about — ack with 200 (so Resend doesn't retry something
      // that will never succeed) rather than error, and log for visibility.
      console.warn('[resend-webhook] unrecognized event type, skipping:', event.type);
      return new Response(JSON.stringify({ received: true, skipped: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // data.to is an array but (per Resend's Jan 2026 webhook-event-
    // visibility change) now only ever contains a single recipient per
    // event — distinct events are sent per-recipient now, not one
    // combined event for a multi-recipient send.
    await admin.from('email_delivery_events').insert({
      resend_email_id: event.data.email_id,
      event_type: event.type,
      recipient: event.data.to?.[0] ?? 'inconnu',
      bounce_type: event.data.bounce?.type ?? null,
      bounce_message: event.data.bounce?.message ?? null,
    });

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }),
);
