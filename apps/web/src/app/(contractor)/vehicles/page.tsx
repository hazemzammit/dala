import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { createClient } from '@/lib/supabase/server';

import { VehiclesView } from './VehiclesView';


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
    .select('id, org_id, name, plate, capacity, status, version, photo_url, deleted_at, created_at')
    .eq('org_id', profile.active_org_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // Field-coverage pass — same signed-URL-per-row convention as
  // projects/team's own list pages.
  const vehiclesWithSignedPhotos = await Promise.all(
    (vehicles ?? []).map(async (vehicle) => {
      if (!vehicle.photo_url) return { ...vehicle, signed_photo_url: null };
      const { data } = await supabase.storage
        .from('org-files')
        .createSignedUrl(vehicle.photo_url, 3600);
      return { ...vehicle, signed_photo_url: data?.signedUrl ?? null };
    }),
  );

  // Field-coverage pass — same duplicate-header bug as team/page.tsx: this
  // plain <h1> duplicated VehiclesView's own PageHero underneath it.
  return (
    <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
      <VehiclesView vehicles={vehiclesWithSignedPhotos} />
    </Suspense>
  );
}
