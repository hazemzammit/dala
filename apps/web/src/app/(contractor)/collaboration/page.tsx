import { redirect } from 'next/navigation';

import { CollaborationView } from './CollaborationView';

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

  const { data: ledProjects } = await supabase
    .from('projects')
    .select('id, name, client_name')
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .order('name');

  const ledProjectIds = (ledProjects ?? []).map((p) => p.id);

  const { data: memberships } = ledProjectIds.length
    ? await supabase
        .from('project_memberships')
        .select('id, project_id, org_id, budget_rollup_opt_in, organizations(name)')
        .in('project_id', ledProjectIds)
        .eq('role', 'trade')
    : { data: [] };

  const { data: pendingInvites } = ledProjectIds.length
    ? await supabase
        .from('project_invitations')
        .select('id, project_id, invited_phone, invited_email, trade_type, status')
        .in('project_id', ledProjectIds)
        .eq('status', 'pending')
    : { data: [] };

  const { data: tradeMemberships } = await supabase
    .from('project_memberships')
    .select('id, project_id, budget_rollup_opt_in, projects(id, name, client_name, lead_org_id)')
    .eq('org_id', orgId)
    .eq('role', 'trade');

  const leadOrgIds = [
    ...new Set(
      (tradeMemberships ?? [])
        .map((m: any) => m.projects?.lead_org_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: leadOrgs } = leadOrgIds.length
    ? await supabase.from('organizations').select('id, name').in('id', leadOrgIds)
    : { data: [] };

  return (
    <CollaborationView
      ledProjects={ledProjects ?? []}
      memberships={(memberships ?? []) as any}
      pendingInvites={pendingInvites ?? []}
      tradeMemberships={(tradeMemberships ?? []) as any}
      leadOrgs={leadOrgs ?? []}
    />
  );
}
