import { redirect } from 'next/navigation';

import { AnnouncementBanner } from './AnnouncementBanner';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

import { createClient } from '@/lib/supabase/server';

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
    .select('full_name, avatar_url, active_org_id')
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

  return (
    <div className="flex h-screen flex-col">
      {/* Admin remediation Tier 2.2 — full-width, above Sidebar too, so it
          reads as "across every screen" the same way Doc 04 §4.2.1's
          unverified-email banner and the mobile OfflineBanner both do,
          not scoped to just the main content column. */}
      <AnnouncementBanner />
      <div className="bg-neutral-25 flex flex-1 overflow-hidden">
        <Sidebar
          organizationName={organization?.name ?? '—'}
          userName={profile.full_name}
          userAvatarUrl={profile.avatar_url ?? undefined}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar userName={profile.full_name} userAvatarUrl={profile.avatar_url ?? undefined} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
