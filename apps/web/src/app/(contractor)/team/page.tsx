import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { TeamView } from './TeamView';

import { createClient } from '@/lib/supabase/server';

/**
 * Doc 04 §4.2.5 — Team roster. Fetches workers + their latest invitation
 * status (pending/accepted/expired) in one page load; TeamView (client)
 * owns the invite modal.
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

  const { data: workers } = await supabase
    .from('active_workers')
    .select(
      'id, org_id, full_name, email, phone, trade, daily_rate, user_id, created_at, deleted_at, photo_url',
    )
    .eq('org_id', profile.active_org_id)
    .order('created_at', { ascending: false });

  const workerIds = (workers ?? []).map((w) => w.id);
  const { data: invitations } = workerIds.length
    ? await supabase
        .from('worker_invitations')
        .select('worker_id, status, sent_at, expires_at')
        .in('worker_id', workerIds)
        .order('sent_at', { ascending: false })
    : { data: [] };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Équipe</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Invitez vos ouvriers pour suivre présence, avances et affectations.
        </p>
      </div>

      <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
        <TeamView workers={workers ?? []} invitations={invitations ?? []} />
      </Suspense>
    </div>
  );
}
