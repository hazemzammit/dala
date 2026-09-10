import { redirect } from 'next/navigation';

import { createMaterial, setMaterialCost } from './actions';
import { MaterialsView } from './MaterialsView';

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

  const { data: materials } = await supabase
    .from('materials')
    .select(
      'id, org_id, project_id, item, quantity, urgency, note, status, rejection_reason, created_by, approved_by, assigned_worker_id, cost, created_at, updated_at',
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const { data: projects } = await supabase
    .from('projects')
    .select(
      'id, lead_org_id, name, client_name, address, budget_total, status, start_date, project_type, cover_photo_url, deleted_at, version, created_by, created_at, updated_at',
    )
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .order('name');

  return (
    <MaterialsView
      materials={materials ?? []}
      projects={projects ?? []}
      createMaterial={createMaterial}
      setMaterialCost={setMaterialCost}
    />
  );
}
