import { redirect } from 'next/navigation';

import { canSeeMoney } from '@/lib/orgRole';
import { createClient } from '@/lib/supabase/server';

import { AnnouncementBanner } from './AnnouncementBanner';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { UnverifiedEmailBanner } from './UnverifiedEmailBanner';


/**
 * apps/web/src/components/shell/AppShell.tsx
 *
 * Wraps every authenticated contractor screen (Doc 04 §4.2.1's persistent
 * sidebar + top bar). Server component: fetches the current user's profile
 * and active org once per navigation, passes plain props down to the
 * client-side Sidebar/TopBar rather than each of them re-fetching.
 *
 * If there's no session or no active org yet, this redirects rather than
 * rendering a broken shell — every (contractor) route assumes both exist.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, active_org_id, email_verified_at')
    .eq('id', user.id)
    .single();

  if (!profile?.active_org_id) {
    // Doc 01 §1.3.13 — no org yet (shouldn't normally happen post-sign-up,
    // since create_organization_for_current_user sets active_org_id, but a
    // worker-only account or an edge case in the sign-up flow could land
    // here without one).
    redirect('/create-organization');
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profile.active_org_id)
    .single();

  // Step N (web shell consistency pass) — TopBar's identity block needs
  // the current user's role in the active org, same data settings/account
  // already fetches this exact way (organization_members.role for
  // user_id + active org_id).
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', profile.active_org_id)
    .eq('user_id', user.id)
    .maybeSingle();

  // Audit fix 2 — org-files is a private bucket (0020), so avatar_url is a
  // storage path, not a fetchable URL. Every other page's header (via this
  // shell, so every authenticated page) was passing the raw path straight
  // to <img>, which just renders broken. Signs it the same way
  // settings/account/page.tsx already does correctly.
  let avatarSignedUrl: string | null = null;
  if (profile.avatar_url) {
    const { data } = await supabase.storage
      .from('org-files')
      .createSignedUrl(profile.avatar_url, 3600);
    avatarSignedUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Admin remediation Tier 2.2 — full-width, above Sidebar too, so it
          reads as "across every screen" the same way Doc 04 §4.2.1's
          unverified-email banner and the mobile OfflineBanner both do,
          not scoped to just the main content column. */}
      <AnnouncementBanner />
      {!profile.email_verified_at && <UnverifiedEmailBanner />}
      <div className="bg-neutral-25 flex flex-1 overflow-hidden">
        <Sidebar
          showMoney={canSeeMoney(membership?.role)}
          organizationName={organization?.name ?? '—'}
          userName={profile.full_name}
          userAvatarUrl={avatarSignedUrl ?? undefined}
          userId={user.id}
          activeOrgId={profile.active_org_id}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            userName={profile.full_name}
            userAvatarUrl={avatarSignedUrl ?? undefined}
            userRole={membership?.role}
            showMoney={canSeeMoney(membership?.role)}
            orgId={profile.active_org_id}
          />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
