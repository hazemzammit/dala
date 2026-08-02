import { redirect } from 'next/navigation';

import { AdvancesView } from './AdvancesView';

import { createClient } from '@/lib/supabase/server';


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

  const orgId = profile.active_org_id;

  const { data: advances } = await supabase
    .from('advances')
    .select('id, worker_id, amount, reason, status, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const { data: workers } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('org_id', orgId)
    .order('full_name');

  return <AdvancesView advances={advances ?? []} workers={workers ?? []} />;
}
