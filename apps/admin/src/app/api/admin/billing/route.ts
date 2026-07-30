/**
 * Doc 06 §6.3 — Billing/Subscriptions.
 *
 * Deliberate, stated scope cut: this is a read-only cross-org plan view,
 * not the MRR/churn/subscription-actions screen Doc 06 §6.3 describes.
 * Confirmed before writing this route:
 *   - No subscriptions/payments/invoices table exists anywhere in
 *     supabase/migrations — `organizations.plan` (migration 0003) is a
 *     plain `text` column with no FK to any billing entity.
 *   - Doc 00 §0.5's risk register still lists the TVA/tax handling
 *     decision as open, blocking any real invoicing schema.
 *   - Doc 01 explicitly states seat-based pricing tiers are "deferred;
 *     MVP ships a single free tier... plan limits are post-MVP" — so this
 *     isn't only a missing-table problem, it's a product decision that
 *     hasn't been made yet.
 * Mobile's own Phase 5 work didn't add a subscriptions table either
 * (checked supabase/migrations/0024_project_invitations_and_shared_layer.sql
 * — no billing-shaped tables there).
 *
 * What this DOES give: a real plan-distribution rollup and the ability to
 * see which orgs are on which plan, reusing the existing, already
 * audit-logged `change_plan` action on the Organizations detail screen
 * rather than duplicating that mutation here.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, plan, created_at, suspended_at, deleted_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orgs = data ?? [];
  const distribution = new Map<string, number>();
  for (const org of orgs) {
    distribution.set(org.plan, (distribution.get(org.plan) ?? 0) + 1);
  }

  return NextResponse.json({
    organizations: orgs,
    planDistribution: Array.from(distribution.entries()).map(([plan, count]) => ({ plan, count })),
  });
}
