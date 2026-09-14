import { redirect } from 'next/navigation';
import { Suspense } from 'react';

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
      'id, lead_org_id, name, client_name, address, budget_total, status, start_date, project_type, cover_photo_url, deleted_at, version, created_by, created_at, updated_at',
    )
    .eq('lead_org_id', profile.active_org_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const projectIds = (projects ?? []).map((project) => project.id);
  const { data: expenses } = projectIds.length
    ? await supabase
        .from('project_expenses')
        .select(
          'id, org_id, project_id, category, amount, description, receipt_photo_url, expense_date, created_by, created_at, deleted_at',
        )
        .eq('org_id', profile.active_org_id)
        .in('project_id', projectIds)
        .is('deleted_at', null)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Chantiers</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Suivez budget, avancement et équipe pour chaque chantier.
        </p>
      </div>

      <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
        <ProjectsView
          projects={projects ?? []}
          expenses={expenses ?? []}
          createProject={createProject}
          updateProject={updateProject}
          deleteProject={deleteProject}
        />
      </Suspense>
    </div>
  );
}
