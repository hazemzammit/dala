import { supabase } from './supabase';

/**
 * apps/mobile/src/lib/myOrgs.ts
 *
 * Doc 05 §2.2's org-switcher pill (Home screen) and Doc 02 §2.8a's Vue
 * d'ensemble both need "which orgs is this account attached to" — this is
 * that lookup, factored out the same way activeOrg.ts factored out the
 * single-org lookup in Phase 1. Kept as a separate file rather than added
 * to activeOrg.ts: activeOrg.ts is explicitly scoped to "which one org am I
 * currently looking at" (a single id), this is "list every org," a
 * different shape of question with a different caller (switcher/rollup
 * screens, not every org-scoped query).
 *
 * Same authorization note as activeOrg.ts: this is a lookup only. Every
 * downstream query these ids get used in still goes through RLS
 * (is_org_member/org_role_of) server-side.
 */
export interface MyOrgSummary {
  org_id: string;
  name: string;
  logo_url: string | null;
  role: 'owner' | 'manager' | 'viewer';
}

/** Every org the current user is a member of, regardless of role. Used by
 *  the org-switcher sheet — you can switch INTO any org you belong to. */
export async function listMyOrganizations(): Promise<MyOrgSummary[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('organization_members')
    .select('org_id, role, organizations(name, logo_url)')
    .eq('user_id', session.user.id);

  if (error || !data) return [];

  return data
    .map((row: any) => ({
      org_id: row.org_id as string,
      role: row.role as MyOrgSummary['role'],
      name: row.organizations?.name ?? '—',
      logo_url: row.organizations?.logo_url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Only the orgs the current user OWNS — Doc 02 §2.8a's Vue d'ensemble is
 *  explicit that this is owned orgs, not every org the account is merely a
 *  member of ("every org the user *owns* — not orgs they're merely a
 *  member of"). "Owns" here means organization_members.role = 'owner';
 *  there is no separate owner_id column on organizations (confirmed by
 *  reading 0003_organizations.sql before writing this — created_by records
 *  who created it, which is a different, immutable fact that doesn't
 *  reflect a later ownership transfer). */
export async function listOwnedOrganizations(): Promise<MyOrgSummary[]> {
  const all = await listMyOrganizations();
  return all.filter((o) => o.role === 'owner');
}
