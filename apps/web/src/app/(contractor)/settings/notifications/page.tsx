import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { NotificationsForm } from './NotificationsForm';


/**
 * apps/web/src/app/(contractor)/settings/notifications/page.tsx
 *
 * Gap-closure guide §1.3 — web equivalent of mobile's
 * notification-settings.tsx. Same `profiles.notification_prefs` jsonb
 * column (migration 0025), same `notificationPrefsSchema` validation.
 *
 * PRODUCT DECISION (confirmed with Hazem): web has no push/device-token
 * registration, so the four category toggles are relabeled here as email
 * notification preferences — each toggle controls whether that category is
 * included in the scheduled email digest, rather than "push notification
 * category" as mobile frames it. The underlying data shape is unchanged
 * (same jsonb keys); only the web copy and framing differ. digest_frequency
 * keeps its existing meaning (off/daily/weekly) unchanged from mobile.
 */
const DEFAULT_PREFS = {
  dispatch: true,
  advances: true,
  materials: true,
  safety: true,
  digest_frequency: 'off' as const,
};

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('notification_prefs')
    .eq('id', user.id)
    .single();

  const prefs = profile?.notification_prefs ?? DEFAULT_PREFS;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <NotificationsForm initialPrefs={prefs} />
    </div>
  );
}
