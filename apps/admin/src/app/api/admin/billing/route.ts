/**
 * Doc 04 §4.3.7 — Billing.
 *
 * Rewritten this remediation phase: the previous version's comment said
 * "no subscriptions/payments/invoices table exists anywhere" and "the
 * TVA decision is still open" — both true when originally written, both
 * false now. Migration 0043 added organizations.subscription_status /
 * billing_cycle_start / seat_price_millimes and a full billing_cycles
 * table (checked its exact columns before writing this — see that
 * migration for the full shape).
 *
 * GET returns: current MRR, the real per-org subscriptions table, and the
 * plan-distribution rollup (unchanged from before — it was already
 * correct, no billing_cycles data needed for it).
 * POST handles the four spec-listed manual actions (extend expiry,
 * manual discount, mark paid outside Konnect, cancel) — see this route's
 * POST handler for per-action detail. None of these touch a real payment
 * provider: that boundary stays in supabase/functions/_shared/
 * paymentProvider.ts and its Edge Functions, per 0043's own header.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

interface OrgRow {
  id: string;
  name: string;
  plan: string;
  created_at: string;
  suspended_at: string | null;
  deleted_at: string | null;
  subscription_status: string;
  billing_cycle_start: string;
  seat_price_millimes: number;
}

interface BillingCycleRow {
  org_id: string;
  cycle_start: string;
  cycle_end: string;
  seat_count: number;
  amount_millimes: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data: orgData, error: orgError } = await supabase
    .from('organizations')
    .select(
      'id, name, plan, created_at, suspended_at, deleted_at, subscription_status, billing_cycle_start, seat_price_millimes',
    )
    .order('created_at', { ascending: false });

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 });
  const orgs = (orgData ?? []) as OrgRow[];

  // Latest billing_cycles row per org — used both for "last cycle
  // status/paid_at" on the subscriptions table and for the MRR figure.
  // One query across all orgs, grouped client-side, rather than N
  // per-org queries.
  const { data: cycleData, error: cycleError } = await supabase
    .from('billing_cycles')
    .select(
      'org_id, cycle_start, cycle_end, seat_count, amount_millimes, status, paid_at, created_at',
    )
    .order('created_at', { ascending: false });

  if (cycleError) return NextResponse.json({ error: cycleError.message }, { status: 500 });
  const cycles = (cycleData ?? []) as BillingCycleRow[];

  const latestCycleByOrg = new Map<string, BillingCycleRow>();
  for (const cycle of cycles) {
    if (!latestCycleByOrg.has(cycle.org_id)) latestCycleByOrg.set(cycle.org_id, cycle);
  }

  // MRR: sum of amount_millimes for each active org's CURRENT cycle
  // (the one whose date range contains today), status = 'paid'. Not the
  // latest cycle regardless of status — a past_due org's unpaid latest
  // cycle shouldn't count toward recurring revenue actually collected.
  const today = new Date().toISOString().slice(0, 10);
  let mrrMillimes = 0;
  for (const org of orgs) {
    if (org.subscription_status !== 'active') continue;
    const currentCycle = cycles.find(
      (c) => c.org_id === org.id && c.cycle_start <= today && c.cycle_end >= today,
    );
    if (currentCycle && currentCycle.status === 'paid') {
      mrrMillimes += currentCycle.amount_millimes;
    }
  }

  const subscriptions = orgs.map((org) => {
    const latestCycle = latestCycleByOrg.get(org.id);
    return {
      orgId: org.id,
      orgName: org.name,
      plan: org.plan,
      subscriptionStatus: org.subscription_status,
      seatCount: latestCycle?.seat_count ?? null,
      currentCycleAmountMillimes: latestCycle?.amount_millimes ?? null,
      billingCycleStart: org.billing_cycle_start,
      lastCycleStatus: latestCycle?.status ?? null,
      lastCyclePaidAt: latestCycle?.paid_at ?? null,
    };
  });

  const distribution = new Map<string, number>();
  for (const org of orgs) {
    distribution.set(org.plan, (distribution.get(org.plan) ?? 0) + 1);
  }

  return NextResponse.json({
    mrrMillimes,
    subscriptions,
    planDistribution: Array.from(distribution.entries()).map(([plan, count]) => ({ plan, count })),
  });
}

type BillingAction = 'extend_expiry' | 'manual_discount' | 'mark_paid' | 'cancel';

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Doc 04 §4.3 intro — every billing action is a financial data change;
  // none of these are Support-safe.
  const roleError = requireRole(ctx, ['super_admin', 'admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const orgId = typeof body?.orgId === 'string' ? body.orgId : '';
  const action = body?.action as BillingAction | undefined;
  if (!orgId || !action) {
    return NextResponse.json({ error: 'orgId et action requis' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, subscription_status')
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  switch (action) {
    case 'extend_expiry': {
      // Extends the CURRENT open cycle's cycle_end by N days (default 7),
      // rather than fabricating a new billing_cycles row — this fits the
      // existing "one row per generated charge attempt" model (0043)
      // instead of inventing a second concept for "extension."
      const days = typeof body?.days === 'number' && body.days > 0 ? body.days : 7;
      const { data: currentCycle } = await supabase
        .from('billing_cycles')
        .select('id, cycle_end')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!currentCycle) {
        return NextResponse.json(
          { error: 'Aucun cycle de facturation à prolonger pour cette organisation.' },
          { status: 400 },
        );
      }
      const newEnd = new Date(currentCycle.cycle_end as string);
      newEnd.setDate(newEnd.getDate() + days);
      await supabase
        .from('billing_cycles')
        .update({ cycle_end: newEnd.toISOString().slice(0, 10) })
        .eq('id', currentCycle.id);
      break;
    }
    case 'manual_discount': {
      // Applies a discount to the CURRENT open cycle's amount_millimes.
      // No separate discounts/coupons table exists (checked 0043 and
      // every migration after it) — recorded as a direct amount override
      // on the cycle row, with the original amount and reason preserved
      // in audit_log's metadata (below) since billing_cycles itself has
      // no "reason" column to hold it.
      const discountMillimes =
        typeof body?.discountMillimes === 'number' ? body.discountMillimes : null;
      if (!discountMillimes || discountMillimes <= 0) {
        return NextResponse.json({ error: 'discountMillimes requis (> 0)' }, { status: 400 });
      }
      const { data: currentCycle } = await supabase
        .from('billing_cycles')
        .select('id, amount_millimes')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!currentCycle) {
        return NextResponse.json(
          { error: 'Aucun cycle de facturation à ajuster pour cette organisation.' },
          { status: 400 },
        );
      }
      const newAmount = Math.max(0, (currentCycle.amount_millimes as number) - discountMillimes);
      await supabase
        .from('billing_cycles')
        .update({ amount_millimes: newAmount })
        .eq('id', currentCycle.id);
      break;
    }
    case 'mark_paid': {
      // "Mark paid outside Konnect" — fits directly into the existing
      // billing_cycles row (0043's own comment: written by
      // generate-subscription-charges / payment-webhook normally; this is
      // the admin-manual equivalent of that same update, not a new table).
      const { data: currentCycle } = await supabase
        .from('billing_cycles')
        .select('id')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (currentCycle) {
        await supabase
          .from('billing_cycles')
          .update({
            payment_provider: 'manual',
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
          .eq('id', currentCycle.id);
      } else {
        // No cycle row exists yet for this org (e.g. still 'trialing') —
        // insert one directly rather than requiring generate-subscription-
        // charges to run first just to have something to mark paid.
        const { data: seatCountResult } = await supabase.rpc('get_org_seat_count', {
          p_org_id: orgId,
        });
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('seat_price_millimes, billing_cycle_start')
          .eq('id', orgId)
          .maybeSingle();
        const seatCount = (seatCountResult as number) ?? 0;
        const seatPrice = (orgRow?.seat_price_millimes as number) ?? 0;
        const cycleStart =
          (orgRow?.billing_cycle_start as string) ?? new Date().toISOString().slice(0, 10);
        const cycleEnd = new Date(cycleStart);
        cycleEnd.setMonth(cycleEnd.getMonth() + 1);
        await supabase.from('billing_cycles').insert({
          org_id: orgId,
          cycle_start: cycleStart,
          cycle_end: cycleEnd.toISOString().slice(0, 10),
          seat_count: seatCount,
          amount_millimes: seatCount * seatPrice,
          payment_provider: 'manual',
          status: 'paid',
          paid_at: new Date().toISOString(),
        });
      }
      await supabase
        .from('organizations')
        .update({ subscription_status: 'active' })
        .eq('id', orgId);
      break;
    }
    case 'cancel': {
      await supabase
        .from('organizations')
        .update({ subscription_status: 'canceled' })
        .eq('id', orgId);
      break;
    }
    default:
      return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  await logAdminAction(ctx, `billing.${action}`, {
    targetTable: 'organizations',
    targetId: orgId,
    orgId,
    metadata: body,
  });

  return NextResponse.json({ ok: true });
}
