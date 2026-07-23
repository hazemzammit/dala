import { redirect } from 'next/navigation';

import { createProject, deleteProject, updateProject } from './actions';
import { ProjectsView } from './ProjectsView';

import { createClient } from '@/lib/supabase/server';

/**
 * Doc 04 §4.2.2 — Projects list. Server Component: résout l'org active
 * (même pattern que vehicles/team) et charge la liste une fois par
 * navigation.
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

  const { data: projects } = await supabase
    .from('projects')
    .select(
      'id, lead_org_id, name, client_name, address, budget_total, status, deleted_at, version, created_by, created_at, updated_at',
    )
    .eq('lead_org_id', profile.active_org_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Chantiers</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Suivez budget, avancement et équipe pour chaque chantier.
        </p>
      </div>

      <ProjectsView
        projects={projects ?? []}
        createProject={createProject}
        updateProject={updateProject}
        deleteProject={deleteProject}
      />
    </div>
  );
}
