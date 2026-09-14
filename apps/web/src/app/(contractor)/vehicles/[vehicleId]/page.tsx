import { notFound, redirect } from 'next/navigation';

import { VehicleDetail } from './VehicleDetail';

import { createClient } from '@/lib/supabase/server';

/**
 * Vehicle detail page (web consistency plan §2.9) — the addressable successor
 * of VehiclesView's inline detail card. Same auth/org resolution as the
 * vehicles list page; the by-id fetch is org-scoped so a foreign id 404s.
 */
export default async function Page({ params }: { params: { vehicleId: string } }) {
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

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, org_id, name, plate, capacity, status, version, photo_url, deleted_at, created_at')
    .eq('id', params.vehicleId)
    .eq('org_id', profile.active_org_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!vehicle) notFound();

  return <VehicleDetail vehicle={vehicle} />;
}
