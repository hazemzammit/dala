import { redirect } from 'next/navigation';

import { DeleteAccountView } from './DeleteAccountView';

import { createClient } from '@/lib/supabase/server';

/**
 * apps/web/src/app/(contractor)/settings/delete-account/page.tsx
 *
 * Gap-closure guide §1.5 — web equivalent of mobile's delete-account.tsx.
 * Same two-step flow: `request_account_deletion` RPC (migration 0028,
 * validates the sole-owner-elsewhere invariant) then the `delete-account`
 * Edge Function (service-role, does the actual auth.admin.deleteUser call
 * a client can never make itself). No 30-day grace period, same as
 * mobile — this is framed as immediate and serious, not undo-able, unlike
 * Trash.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <DeleteAccountView />
    </div>
  );
}
