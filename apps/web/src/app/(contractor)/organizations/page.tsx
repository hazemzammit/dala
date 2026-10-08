import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { OrganizationsOverviewView } from './OrganizationsOverviewView';


/**
 * apps/web/src/app/(contractor)/organizations/page.tsx
 *
 * Gap-closure guide §1.8 (Phase 7) — web port of mobile's vue-ensemble.tsx.
 * Confirmed before building: web has no org-switcher at all today (every
 * route assumes a single `active_org_id`, per the guide's own note) — so
 * there's no existing overlap to duplicate, this is genuinely new surface
 * area, not a re-hash of something the sidebar already does.
 *
 * Scope note, stated rather than silently decided: the guide groups this
 * together with `portfolio.tsx` under "multi-org overview," but
 * `portfolio.tsx`'s own header comment says otherwise — it's a
 * cross-PROJECT rollup within a SINGLE org, unrelated to multi-org at all
 * (mobile's own file header is explicit: "Vue d'ensemble rolls up ACROSS
 * ORGANIZATIONS... this screen rolls up ACROSS PROJECTS WITHIN one org").
 * Only this screen (vue-ensemble) is actually multi-org work; portfolio.tsx
 * is a separate, single-org feature and isn't built here — flagged for a
 * separate decision rather than assumed in scope.
 *
 * "Owned orgs" only, matching mobile's `listOwnedOrganizations()` exactly
 * (role = 'owner' in organization_members — there's no owner_id column on
 * organizations, confirmed by checking 0003_organizations.sql, same check
 * mobile's myOrgs.ts documents having done).
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <OrganizationsOverviewView userId={user.id} />
    </div>
  );
}
