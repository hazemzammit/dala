/**
 * apps/admin/src/lib/users/actions.ts
 *
 * Admin remediation Tier 4.3 — same reasoning as
 * lib/organizations/actions.ts: extracted from
 * api/admin/users/[userId]/route.ts's inline suspend/unsuspend cases so
 * the new bulk route (api/admin/users/bulk/route.ts) reuses the exact
 * same mutation rather than re-implementing it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export async function setUserSuspended(
  supabase: SupabaseClient,
  userId: string,
  suspended: boolean,
): Promise<void> {
  await supabase
    .from('profiles')
    .update({ suspended_at: suspended ? new Date().toISOString() : null })
    .eq('id', userId);
}
