import { redirect } from 'next/navigation';

import { FeedbackForm } from './FeedbackForm';

import { createClient } from '@/lib/supabase/server';

/**
 * apps/web/src/app/(contractor)/feedback/page.tsx
 *
 * Gap-closure guide §1.6 — web equivalent of mobile's feedback.tsx.
 * Same non-org-scoped submission reasoning as mobile (see migration 0074's
 * `feedback` table comment): org_id is resolved best-effort server-side in
 * the action, never required, and this screen doesn't gate on active-org
 * status the way operational screens do.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <FeedbackForm />
    </div>
  );
}
