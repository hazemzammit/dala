import { redirect } from 'next/navigation';

import { PortfolioView } from './PortfolioView';

import { createClient } from '@/lib/supabase/server';

/**
 * apps/web/src/app/(contractor)/portfolio/page.tsx
 *
 * Web port of mobile's portfolio.tsx — flagged separately from the
 * gap-closure guide (which mis-grouped it under §1.8 "multi-org
 * overview") and built as its own item at Hazem's explicit request.
 * Confirmed via that file's own header comment: this is a cross-PROJECT
 * rollup WITHIN one org, unrelated to multi-org — a genuinely different
 * screen from `/organizations` (§1.8), not a duplicate.
 *
 * Read-only, same four figures mobile's own header says were deliberately
 * reused rather than invented: budget-consumed % (project_expenses),
 * worker-days this month (attendance_effective, status='present',
 * post-0036's already-fixed double-counting), workers dispatched today
 * (dispatch_assignments), pending materials requests (materials,
 * status='pending').
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) redirect('/create-organization');

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PortfolioView orgId={profile.active_org_id} />
    </div>
  );
}
