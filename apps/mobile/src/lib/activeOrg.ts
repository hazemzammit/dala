import { supabase } from './supabase';

/**
 * apps/mobile/src/lib/activeOrg.ts
 *
 * Doc 03 §3.9's org-switcher note: `profiles.active_org_id` is the source of
 * truth for "which org am I currently looking at," updated whenever the
 * switcher is used. Every Phase 1 contractor screen (vehicles, team,
 * pointage, dispatch) needs this same lookup before it can scope a query —
 * factored out here instead of duplicating the two-step
 * session→profile→active_org_id fetch in every screen file.
 *
 * This performs the LOOKUP only; it never decides authorization — every
 * query still goes through RLS server-side (is_org_member/org_role_of,
 * Doc 01 §1.5), this is just "which org_id do I filter by."
 */
export async function getActiveOrgId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profile?.active_org_id) return profile.active_org_id;

  // Fallback for an account that hasn't gone through org creation with
  // active_org_id set yet (shouldn't normally happen post-sign-up, but
  // cheaper to guard here than to have every screen special-case a null).
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', session.user.id)
    .limit(1)
    .maybeSingle();

  return membership?.org_id ?? null;
}

/**
 * Doc 01 §1.4 — this is a UX convenience only (e.g. hiding the "Nouvelle
 * dépense" FAB for a Viewer, Doc 03 §3.10.3a), never the actual
 * authorization boundary: every write this gates is independently
 * enforced server-side by the matching `org_role_of(org_id) in
 * ('owner','manager')` RLS policy, which still applies even if a client
 * were modified to skip this check.
 */
export async function getMyOrgRole(orgId: string): Promise<'owner' | 'manager' | 'viewer' | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', session.user.id)
    .maybeSingle();

  return (data?.role as 'owner' | 'manager' | 'viewer' | undefined) ?? null;
}
