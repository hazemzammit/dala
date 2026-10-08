// Stripe webhook signature verification (https://stripe.com/docs/webhooks#verify-manually)
// without pulling in the Stripe SDK.
//
// Stripe-Signature header:   t=<unix seconds>,v1=<hex hmac>[,v1=<hex hmac>...][,v0=...]
// signed payload:            `${t}.${rawBody}`
// signature:                 HMAC-SHA256(secret, signed payload), hex
//
// A body that is not authenticated this way must never be trusted: the
// payment-webhook function marks billing cycles paid and flips an
// organisation's subscription_status, and it is reachable by anyone holding
// the (public) project anon key.

export class WebhookSignatureError extends Error {
  constructor(reason: string) {
    super(`webhook signature invalid: ${reason}`);
    this.name = 'WebhookSignatureError';
  }
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

/** Constant-time on the hex strings (length differences leak nothing useful: the length is public). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyOptions {
  /** Max accepted clock difference in seconds (Stripe's default is 300). */
  toleranceSeconds?: number;
  /** Injected for tests. */
  nowMs?: number;
}

/**
 * Throws WebhookSignatureError unless `header` carries a valid v1 signature of
 * `rawBody` under `secret`, made within the tolerance window (replay
 * protection). Any of several v1 signatures may match (secret rotation).
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  options: VerifyOptions = {},
): Promise<void> {
  if (!secret) throw new WebhookSignatureError('no signing secret configured');
  if (!header) throw new WebhookSignatureError('missing Stripe-Signature header');

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') signatures.push(v);
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) throw new WebhookSignatureError('bad timestamp');
  if (signatures.length === 0) throw new WebhookSignatureError('no v1 signature');

  const tolerance = options.toleranceSeconds ?? 300;
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > tolerance) {
    throw new WebhookSignatureError('timestamp outside tolerance (possible replay)');
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  // Evaluate every candidate (no early exit).
  const matches = signatures.map((s) => timingSafeEqualHex(s.toLowerCase(), expected));
  if (!matches.some(Boolean)) throw new WebhookSignatureError('signature mismatch');
}
