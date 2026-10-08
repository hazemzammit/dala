// supabase/functions/generate-subscription-charges/index.ts
//
// Doc 02 §2.10 seat-based billing. Triggered daily by pg_cron
// (0043_seat_billing_and_subscription_cycles.sql), same "trigger daily, let
// the function decide who's actually due" shape send-digest-notifications
// already established.
//
// For every org whose current cycle has elapsed (billing_cycle_start + 1
// month <= today) and whose subscription_status isn't 'canceled': count
// seats (owner/manager accounts only -- get_org_seat_count, 0043), insert a
// 'pending' billing_cycles row, ask the active payment provider for a
// payment request, then store its ref + URL on that row. billing.tsx reads
// the resulting row to show the org owner what's due and where to pay.
//
// Deliberately NOT touched here: what happens on non-payment past cycle_end
// (locking the org, downgrading it, etc.) -- that's a product decision not
// yet made (see chat), so subscription_status only ever moves to
// 'past_due' here as an honest flag, nothing is enforced against it yet.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { createPaymentRequest } from '../_shared/paymentProvider.ts';
import { requireInternalCaller } from '../_shared/internalAuth.ts';

const JOB_NAME = 'generate_subscription_charges';

Deno.serve(async (req) => {
  // Internal-only: reject anyone who is not the platform (cron / service role).
  const denied = await requireInternalCaller(req);
  if (denied) return denied;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: jobRun } = await admin
    .from('scheduled_job_runs')
    .insert({ job_name: JOB_NAME })
    .select()
    .single();

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Orgs whose current cycle has elapsed. billing_cycle_start advances by
    // one month each time a charge is successfully generated below -- this
    // query is intentionally the only place that decides "due," so there is
    // one source of truth for it, not one in SQL and a duplicate in code.
    const { data: dueOrgs, error: orgsError } = await admin
      .from('organizations')
      .select('id, name, seat_price_millimes, billing_cycle_start, subscription_status')
      .neq('subscription_status', 'canceled')
      .lte('billing_cycle_start', subtractOneMonth(today));
    if (orgsError) throw orgsError;

    let generated = 0;
    let failed = 0;

    for (const org of dueOrgs ?? []) {
      try {
        const { data: seatCount, error: seatError } = await admin.rpc('get_org_seat_count', {
          p_org_id: org.id,
        });
        if (seatError) throw seatError;

        const amountMillimes = (seatCount ?? 0) * org.seat_price_millimes;
        const cycleStart = org.billing_cycle_start as string;
        const cycleEnd = addOneMonth(cycleStart);

        const { data: cycleRow, error: insertError } = await admin
          .from('billing_cycles')
          .insert({
            org_id: org.id,
            cycle_start: cycleStart,
            cycle_end: cycleEnd,
            seat_count: seatCount ?? 0,
            amount_millimes: amountMillimes,
            payment_provider: Deno.env.get('PAYMENT_PROVIDER') ?? 'stripe_test',
            status: 'pending',
          })
          .select()
          .single();
        if (insertError) throw insertError;

        const paymentRequest = await createPaymentRequest({
          billingCycleId: cycleRow.id,
          amountMillimes,
          orgName: org.name,
        });

        await admin
          .from('billing_cycles')
          .update({
            external_ref: paymentRequest.externalRef,
            payment_url: paymentRequest.paymentUrl,
          })
          .eq('id', cycleRow.id);

        // Advance the org's cycle start now, not on payment confirmation --
        // a charge having been GENERATED for this cycle is what "due" means
        // above; whether it gets PAID is what subscription_status /
        // payment-webhook track separately. This mirrors billing systems
        // generally: the cycle boundary moves on schedule regardless of
        // payment outcome, and non-payment is handled as a past_due flag on
        // the org, not by re-generating the same cycle indefinitely.
        await admin
          .from('organizations')
          .update({ billing_cycle_start: cycleEnd })
          .eq('id', org.id);

        generated++;
      } catch (orgErr) {
        console.error(`[generate-subscription-charges] org ${org.id} failed:`, orgErr);
        failed++;
      }
    }

    await admin
      .from('scheduled_job_runs')
      .update({ status: 'success', completed_at: new Date().toISOString() })
      .eq('id', jobRun.id);

    return new Response(JSON.stringify({ generated, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from('scheduled_job_runs')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', jobRun.id);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function addOneMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function subtractOneMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}
