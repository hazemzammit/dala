import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { createClient } from '@/lib/supabase/server';

import { createProject, deleteProject, updateProject } from './actions';
import { ProjectsView } from './ProjectsView';


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

  // Field-coverage pass — cover_photo_url is a private-bucket storage path
  // (org-files, same bucket AppShell/roles/safety already sign against),
  // never a fetchable URL directly. Same "one Promise.all pass over the
  // whole list" convention safety/page.tsx and journal/page.tsx already
  // use for their own photo fields.
  const projectsWithSignedCovers = await Promise.all(
    (projects ?? []).map(async (project) => {
      if (!project.cover_photo_url) return { ...project, signed_cover_photo_url: null };
      const { data } = await supabase.storage
        .from('org-files')
        .createSignedUrl(project.cover_photo_url, 3600);
      return { ...project, signed_cover_photo_url: data?.signedUrl ?? null };
    }),
  );
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

  // Real teamSize (plan Step 11 / audit §1.6): count each project's durable
  // staffing roster (project_workers, migration 0034, RLS org-scoped)
  // instead of the index-fabricated number the view used to display.
  const { data: rosterCounts } = projectIds.length
    ? await supabase.from('project_workers').select('project_id').in('project_id', projectIds)
    : { data: [] };
  const teamSizeByProject: Record<string, number> = {};
  for (const row of rosterCounts ?? []) {
    teamSizeByProject[row.project_id] = (teamSizeByProject[row.project_id] ?? 0) + 1;
  }

  // Field-coverage pass — same duplicate-header bug as team/page.tsx and
  // vehicles/page.tsx: this plain <h1> duplicated ProjectsView's own
  // PageHero underneath it.
  return (
    <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
      <ProjectsView
        projects={projectsWithSignedCovers}
        expenses={expenses ?? []}
        teamSizeByProject={teamSizeByProject}
        createProject={createProject}
        updateProject={updateProject}
        deleteProject={deleteProject}
        activeOrgId={profile.active_org_id}
      />
    </Suspense>
  );
}
