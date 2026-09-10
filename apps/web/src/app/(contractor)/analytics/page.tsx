import { redirect } from 'next/navigation';

import { AnalyticsView } from './AnalyticsView';

import { createClient } from '@/lib/supabase/server';

/**
 * apps/web/src/app/(contractor)/analytics/page.tsx
 *
 * Gap-closure guide §1.10 (Phase 7) — web port of mobile's analytics.tsx,
 * read in full before starting, as the guide asked. Every formula, window,
 * threshold, and judgment call in AnalyticsView.tsx is carried over
 * unchanged from that file's own header/inline comments — this is an
 * assembly job, not a re-derivation. See AnalyticsView.tsx for the
 * section-by-section detail.
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
      <AnalyticsView orgId={profile.active_org_id} />
    </div>
  );
}
