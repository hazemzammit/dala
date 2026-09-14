import { notFound, redirect } from 'next/navigation';

import { WorkerDetail } from './WorkerDetail';

import { createClient } from '@/lib/supabase/server';

/**
 * Worker detail page (web consistency plan §2.9) — the addressable successor
 * of TeamView's inline detail card. Same auth/org resolution as the team
 * list page; the by-id fetch is the same `active_workers` select scoped to
 * the caller's org so a foreign id 404s instead of leaking.
 */
export default async function Page({ params }: { params: { workerId: string } }) {
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

  const { data: worker } = await supabase
    .from('active_workers')
    .select(
      'id, org_id, full_name, email, phone, trade, daily_rate, user_id, created_at, deleted_at, photo_url',
    )
    .eq('id', params.workerId)
    .eq('org_id', profile.active_org_id)
    .maybeSingle();
  if (!worker) notFound();

  // Latest invitation, same shape the list page resolves per worker.
  const { data: invitations } = await supabase
    .from('worker_invitations')
    .select('worker_id, status')
    .eq('worker_id', params.workerId)
    .order('sent_at', { ascending: false })
    .limit(1);

  return <WorkerDetail worker={worker} invitationStatus={invitations?.[0]?.status ?? null} />;
}
