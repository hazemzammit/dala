/**
 * Role helpers for the web app.
 *
 * The `viewer` (Observateur) role is money-blind (migration 0103): the database
 * no longer returns advances, salary cycles, expenses or invoices to viewers,
 * so a screen that queries them would show empty lists and "0 TND" — misleading
 * rather than merely restricted. Screens therefore ask `canSeeMoney` up front
 * and render a clear restricted state instead.
 *
 * This is presentation only. RLS is the boundary; never rely on this check for
 * security.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgRole = 'owner' | 'manager' | 'viewer';

export function canSeeMoney(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

export async function getOrgRole(
  supabase: Pick<SupabaseClient, 'from'>,
  orgId: string,
  userId: string,
): Promise<OrgRole | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  const role = data?.role;
  return role === 'owner' || role === 'manager' || role === 'viewer' ? role : null;
}
