// supabase/functions/payment-webhook/index.ts
//
// Doc 02 §2.10 seat-based billing. The callback endpoint the active payment
// provider hits when a billing_cycles charge resolves. Register this
// function's URL (…/functions/v1/payment-webhook) as the webhook endpoint
// in the provider's dashboard (Stripe: Developers → Webhooks, listening for
// checkout.session.completed / checkout.session.expired; for local testing,
// `stripe listen --forward-to <url>` prints the signing secret to put in
// STRIPE_WEBHOOK_SECRET).
//
// service_role only, same as every other Edge Function in this repo that
// mutates billing/subscription state -- a webhook has no user JWT to check
// against RLS at all, so it deliberately runs on the admin client and does
// its own explicit lookup rather than relying on RLS for anything.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { parseWebhookEvent } from '../_shared/paymentProvider.ts';

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let event;
  try {
    event = await parseWebhookEvent(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[payment-webhook] failed to parse event:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: cycle, error: fetchError } = await admin
    .from('billing_cycles')
    .select('id, org_id, status')
    .eq('id', event.billingCycleId)
    .maybeSingle();

  if (fetchError) {
    console.error('[payment-webhook] lookup failed:', fetchError);
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!cycle) {
    // Unknown billing_cycle_id: log and return 200 anyway. Returning an
    // error here would make the provider retry indefinitely for an event
    // that will never resolve to a real row (e.g. a stale/duplicate
    // webhook after a row was deleted) -- 200 tells the provider "received,
    // don't retry," which is the correct signal for an event this endpoint
    // can't act on.
    console.warn(`[payment-webhook] no billing_cycles row for id ${event.billingCycleId}`);
    return new Response(JSON.stringify({ received: true, matched: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (cycle.status === 'paid') {
    // Already-processed event (provider retried, or two events raced) --
    // idempotent no-op rather than double-applying the "mark org active"
    // side effect below.
    return new Response(JSON.stringify({ received: true, alreadyProcessed: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await admin
    .from('billing_cycles')
    .update({
      status: event.status,
      paid_at: event.status === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', cycle.id);

  await admin
    .from('organizations')
    .update({ subscription_status: event.status === 'paid' ? 'active' : 'past_due' })
    .eq('id', cycle.org_id);

  return new Response(JSON.stringify({ received: true, matched: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
