/**
 * apps/admin/src/lib/organizations/actions.ts
 *
 * Admin remediation Tier 4.3 — extracted from
 * api/admin/organizations/[orgId]/route.ts's inline `case 'change_plan'`
 * so the new bulk route (api/admin/organizations/bulk/route.ts) can reuse
 * the exact same mutation instead of re-implementing it — per the plan's
 * own instruction ("reuse the existing single-row action functions,
 * don't duplicate the logic"). The single-org route now calls this too,
 * so there's exactly one place this update is written.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function changeOrgPlan(
  supabase: SupabaseClient,
  orgId: string,
  plan: string,
): Promise<void> {
  await supabase.from('organizations').update({ plan }).eq('id', orgId);
}
