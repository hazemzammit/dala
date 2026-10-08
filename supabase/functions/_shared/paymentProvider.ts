/**
 * supabase/functions/_shared/paymentProvider.ts
 *
 * Abstraction boundary between "generate a charge for a billing cycle" /
 * "handle a payment confirmation webhook" and whichever real payment
 * provider answers those calls.
 *
 * WHY THIS EXISTS: Konnect (the intended production provider, Doc 02 §2.10)
 * requires a merchant KYC application before issuing even a sandbox API
 * key -- not available to build/test against yet. Stripe test mode issues
 * usable API keys instantly with zero verification, so it stands in here to
 * let the cron job + webhook + billing_cycles/subscription_status logic be
 * built and actually exercised end-to-end today. Nothing outside this file
 * (the migration, generate-subscription-charges, payment-webhook) knows or
 * cares which provider is live -- switching to Konnect once a merchant
 * account clears means implementing the two functions below against
 * Konnect's API and changing PAYMENT_PROVIDER, not touching any caller.
 *
 * Selected via the PAYMENT_PROVIDER env var / Vault secret:
 *   'stripe_test' (default) -- implemented for real below.
 *   'konnect'               -- stubbed; throws a clear, actionable error
 *                              rather than silently no-op-ing or faking
 *                              success, so a misconfiguration is loud.
 *
 * Konnect's own API shape (confirmed from public docs, not guessed): a POST
 * to an "initiate payment" endpoint returns a paymentRef + a hosted payment
 * URL the payer completes the transaction on -- conceptually the same
 * "create a request, get back a ref + URL, wait for a webhook" shape
 * implemented here for Stripe, which is why this abstraction's signature is
 * shaped the way it is rather than mirroring the Stripe API specifically.
 */

import { verifyStripeSignature, WebhookSignatureError } from './stripeSignature.ts';

export { WebhookSignatureError };

export interface CreatePaymentRequestParams {
  /** billing_cycles.id -- becomes the provider's client reference / metadata, so a webhook can be matched back to the row that requested it. */
  billingCycleId: string;
  amountMillimes: number;
  orgName: string;
}

export interface CreatePaymentRequestResult {
  /** Provider's own reference for this payment (Stripe PaymentIntent id / Konnect paymentRef). Stored in billing_cycles.external_ref. */
  externalRef: string;
  /** Hosted URL the org owner opens to actually pay. Stored in billing_cycles.payment_url. */
  paymentUrl: string;
}

export interface WebhookEvent {
  /** billing_cycles.id, read back from the metadata/reference field the
   * provider was asked to echo -- used to look the row up directly rather
   * than matching on the provider's own external_ref, since that shape
   * varies by provider and echoing our own id back is the one thing every
   * provider supports (Stripe's `metadata`, Konnect's own reference field). */
  billingCycleId: string;
  status: 'paid' | 'failed';
}

function activeProvider(): 'stripe_test' | 'konnect' {
  const configured = Deno.env.get('PAYMENT_PROVIDER') ?? 'stripe_test';
  if (configured !== 'stripe_test' && configured !== 'konnect') {
    throw new Error(
      `Unknown PAYMENT_PROVIDER "${configured}" -- expected "stripe_test" or "konnect".`,
    );
  }
  return configured;
}

export async function createPaymentRequest(
  params: CreatePaymentRequestParams,
): Promise<CreatePaymentRequestResult> {
  const provider = activeProvider();
  if (provider === 'konnect') {
    throw new Error(
      'PAYMENT_PROVIDER is set to "konnect" but createPaymentRequest() has no ' +
        'real Konnect implementation yet -- Konnect requires a merchant KYC ' +
        'application not completed as of this file. Implement this branch ' +
        'against Konnect\'s "initiate payment" endpoint once KONNECT_API_KEY ' +
        'and KONNECT_WALLET_ID secrets exist, or set PAYMENT_PROVIDER back to ' +
        '"stripe_test" to keep testing the surrounding cron/webhook flow.',
    );
  }
  return createStripeTestPaymentRequest(params);
}

/**
 * Verifies and parses a provider webhook. Returns null for events this flow does not act on
 * (the caller answers 200 so the provider does not retry them). Throws
 * WebhookSignatureError when the request is not authentic.
 */
export async function parseWebhookEvent(req: Request): Promise<WebhookEvent | null> {
  const provider = activeProvider();
  if (provider === 'konnect') {
    throw new Error(
      'PAYMENT_PROVIDER is set to "konnect" but parseWebhookEvent() has no ' +
        "real Konnect implementation yet -- see createPaymentRequest()'s error " +
        'for the same reasoning.',
    );
  }
  return parseStripeTestWebhookEvent(req);
}

// -----------------------------------------------------------------------
// Stripe test-mode implementation. Uses a Checkout Session, not a bare
// PaymentIntent -- Sessions give a ready-to-open hosted payment_url in one
// call, the same "one request, get back a ref + a URL" shape
// billing.tsx / generate-subscription-charges expects, and the same shape
// Konnect's own "initiate payment" endpoint returns. Plain `fetch` against
// Stripe's REST API, no SDK dependency -- same pattern this repo's own
// resend.ts already uses for Resend.
// -----------------------------------------------------------------------

async function createStripeTestPaymentRequest(
  params: CreatePaymentRequestParams,
): Promise<CreatePaymentRequestResult> {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY not set -- create a free Stripe account, copy the ' +
        'test-mode secret key (starts with sk_test_) from the Stripe ' +
        'dashboard, and register it as a Supabase secret / Vault entry.',
    );
  }

  const amountTnd = params.amountMillimes / 1000;

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd', // Stripe test mode doesn't price in TND; usd is a stand-in for exercising the flow only -- not a real-money concern in test mode.
    'line_items[0][price_data][product_data][name]': `Dala — ${params.orgName} seat billing`,
    'line_items[0][price_data][unit_amount]': String(Math.round(amountTnd * 100)),
    'line_items[0][quantity]': '1',
    success_url: 'https://dala.tn/billing/success',
    cancel_url: 'https://dala.tn/billing/cancel',
    'metadata[billing_cycle_id]': params.billingCycleId,
  });

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Stripe checkout session creation failed (${res.status}): ${errText}`);
  }

  const session = await res.json();
  return {
    externalRef: session.id as string,
    paymentUrl: session.url as string,
  };
}

async function parseStripeTestWebhookEvent(req: Request): Promise<WebhookEvent | null> {
  // The Stripe-Signature header is verified against the RAW body BEFORE the JSON is looked at.
  // (This used to be a presence check on STRIPE_WEBHOOK_SECRET only, so anyone able to reach the
  // function — it is behind verify_jwt, but the anon key is public — could POST a forged
  // "checkout.session.completed" and mark any billing cycle paid / any org past_due.)
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET not set -- register the signing secret shown ' +
        'when you add this endpoint URL in the Stripe dashboard (or via ' +
        '`stripe listen` for local testing).',
    );
  }

  const rawBody = await req.text();
  await verifyStripeSignature(rawBody, req.headers.get('stripe-signature'), webhookSecret);

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new Error('Stripe webhook body is not valid JSON.');
  }

  // Only the checkout outcomes this billing flow creates are acted on. Everything else Stripe may
  // send to the endpoint (charge.refunded, payment_intent.*, ...) used to be treated as "failed"
  // and flip the org to past_due — now it is acknowledged and ignored.
  let status: WebhookEvent['status'];
  const session = event.data?.object as
    | { payment_status?: string; metadata?: { billing_cycle_id?: string } }
    | undefined;
  switch (event.type) {
    case 'checkout.session.completed':
      // A completed session can still be unpaid (delayed payment methods).
      if (session?.payment_status !== 'paid') return null;
      status = 'paid';
      break;
    case 'checkout.session.async_payment_succeeded':
      status = 'paid';
      break;
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      status = 'failed';
      break;
    default:
      return null;
  }

  const billingCycleId = session?.metadata?.billing_cycle_id;
  if (!billingCycleId) {
    throw new Error('Stripe webhook payload missing metadata.billing_cycle_id.');
  }
  return { billingCycleId, status };
}
