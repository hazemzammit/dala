import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { DispatchWeekView } from './DispatchWeekView';


/**
 * apps/web/src/app/(contractor)/dispatch/week/page.tsx
 *
 * Gap-closure guide §1.9 (Phase 7) — web port of mobile's
 * dispatch-week.tsx, confirmed as real, distinct work after checking web's
 * existing dispatch grid first (per the guide's own instruction): web's
 * grid is vehicle × day, answering "who's in which truck"; this screen is
 * project × day worker-COUNTS, answering "which project is short-staffed
 * N days out" — a different question the existing grid doesn't answer,
 * not a duplicate of it.
 *
 * Read-only by design, same as mobile: no new RPC (a single
 * `dispatch_assignments` range query, RLS already permits it — the same
 * `dispatch_assignments_select_member` policy the main dispatch board
 * already relies on), client-side aggregation, and clicking a day
 * navigates into `/dispatch?date=` for the existing full edit view rather
 * than reimplementing editing here.
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
      <DispatchWeekView orgId={profile.active_org_id} />
    </div>
  );
}
