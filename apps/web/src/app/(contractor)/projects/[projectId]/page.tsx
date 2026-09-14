import { redirect } from 'next/navigation';

import { createProject, updateProject } from '../actions';
import { getProjectDashboard } from '../getProjectDashboard';

import { ProjectDetail } from './ProjectDetail';

import { createClient } from '@/lib/supabase/server';

/**
 * Doc 04 §4.2.2 — Project detail. Server Component: resolves the active org
 * (same pattern as projects/page.tsx), then loads ONE project by id scoped
 * to that org, its expenses, the caller's membership role, and the real
 * getProjectDashboard summary — the data the old inline panel in
 * ProjectsView fetched and threw away (web consistency plan §2.8). Rows
 * are org-scoped with the same `.eq('lead_org_id', ...)` + `.is('deleted_at',
 * null)` guards the list page uses; anything unreachable redirects back to
 * the list rather than 404ing (org privacy is RLS-enforced regardless).
 */
export default async function Page({ params }: { params: { projectId: string } }) {
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

  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, lead_org_id, name, client_name, address, budget_total, status, start_date, project_type, cover_photo_url, deleted_at, version, created_by, created_at, updated_at',
    )
    .eq('lead_org_id', profile.active_org_id)
    .eq('id', params.projectId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!project) redirect('/projects');

  const { data: expenses } = await supabase
    .from('project_expenses')
    .select(
      'id, org_id, project_id, category, amount, description, receipt_photo_url, expense_date, created_by, created_at, deleted_at',
    )
    .eq('org_id', profile.active_org_id)
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', profile.active_org_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const dashboard = await getProjectDashboard(project.id, project.budget_total);

  return (
    <ProjectDetail
      project={project}
      expenses={expenses ?? []}
      dashboard={dashboard}
      orgId={profile.active_org_id}
      canWrite={membership?.role === 'owner' || membership?.role === 'manager'}
      createProject={createProject}
      updateProject={updateProject}
    />
  );
}
