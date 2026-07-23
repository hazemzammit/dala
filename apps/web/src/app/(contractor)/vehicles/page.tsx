import { redirect } from 'next/navigation';

import { VehiclesView } from './VehiclesView';

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

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, org_id, name, plate, capacity, status, created_at')
    .eq('org_id', profile.active_org_id)
    .order('created_at', { ascending: false });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Véhicules</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Gérez votre parc pour l&apos;inclure dans le dispatch quotidien.
        </p>
      </div>

      <VehiclesView vehicles={vehicles ?? []} />
    </div>
  );
}
