import { redirect } from 'next/navigation';

import { RolesView } from './RolesView';

import { createClient } from '@/lib/supabase/server';

/**
 * Audit fix 1a — `org_members_directory` (the RPC the collaborator's
 * original version called) never existed anywhere in this repo, and the
 * direct `.from('profiles').select(...).in('id', userIds)` fallback that
 * replaced it silently returned zero rows for every member who wasn't the
 * caller themselves (profiles_select_own, 0005, is `id = auth.uid()`
 * only — no error, just an empty result masked by `?? 'Membre'`). Now
 * uses `get_org_member_profiles` (0085), the org-scoped RPC built to
 * close that gap for exactly this kind of batched member lookup.
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

  const orgId = profile.active_org_id;

  const { data: memberRows } = await supabase
    .from('organization_members')
    .select('user_id, role, joined_at')
    .eq('org_id', orgId);

  const { data: memberProfiles } = await supabase.rpc('get_org_member_profiles', {
    p_org_id: orgId,
  });
  const profileById: Record<string, { full_name: string; avatar_url: string | null }> =
    Object.fromEntries(
      (memberProfiles ?? []).map(
        (p: { id: string; full_name: string; avatar_url: string | null }) => [
          p.id,
          { full_name: p.full_name, avatar_url: p.avatar_url },
        ],
      ),
    );

  const members = await Promise.all(
    (memberRows ?? [])
      .map((m) => ({
        user_id: m.user_id,
        role: m.role as 'owner' | 'manager' | 'viewer',
        joined_at: m.joined_at,
        full_name: profileById[m.user_id]?.full_name ?? 'Membre',
        avatar_url: profileById[m.user_id]?.avatar_url ?? null,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name))
      .map(async (m) => {
        // Audit fix 2 — org-files is a private bucket (0020); RolesView
        // was rendering avatar_url raw, which just renders broken. Signs
        // it here (batched via Promise.all across the roster) the same
        // way settings/account/page.tsx already does for a single user.
        if (!m.avatar_url) return m;
        const { data } = await supabase.storage
          .from('org-files')
          .createSignedUrl(m.avatar_url, 3600);
        return { ...m, avatar_url: data?.signedUrl ?? null };
      }),
  );

  const myMembership = memberRows?.find((m) => m.user_id === user.id);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <RolesView
        members={members}
        currentUserId={user.id}
        currentUserRole={myMembership?.role ?? 'viewer'}
      />
    </div>
  );
}
