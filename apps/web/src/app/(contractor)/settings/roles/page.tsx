import { redirect } from 'next/navigation';

import { RolesView } from './RolesView';

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

  const { data: members } = await supabase.rpc('org_members_directory', {
    target_org: profile.active_org_id,
  });

  const { data: myMembership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', profile.active_org_id)
    .eq('user_id', user.id)
    .single();

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Rôles & permissions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Gérez les rôles des membres de votre organisation.
        </p>
      </div>

      <RolesView
        members={members ?? []}
        orgId={profile.active_org_id}
        currentUserId={user.id}
        currentUserRole={myMembership?.role ?? 'viewer'}
      />
    </div>
  );
}
