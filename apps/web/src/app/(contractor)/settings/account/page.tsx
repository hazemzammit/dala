import { redirect } from 'next/navigation';

import { AccountForm } from './AccountForm';

import { createClient } from '@/lib/supabase/server';

/**
 * apps/web/src/app/(contractor)/settings/account/page.tsx
 *
 * Gap-closure guide §1.3 — profile+notifications chunk. Web equivalent of
 * mobile's profile-settings.tsx (which renders the shared
 * components/profile/ProfileScreen.tsx with role="contractor").
 *
 * Web is contractor/admin only — there's no worker-role session here — so
 * this ports only the `role === 'contractor'` branch of ProfileScreen.tsx:
 * name/phone/email/avatar/emergency-contact editing + the org role/joined_at
 * row. The `role === 'worker'` branch (trade/job_title/hire_date, the
 * `workers` self-select) has no web equivalent to port to and is left out.
 *
 * Notification preferences are deliberately NOT on this page — see the
 * settings/page.tsx "Notifications" module, still marked "Bientôt
 * disponible" pending a product decision on what a push-category toggle
 * means on a platform with no device-token registration (flagged in the
 * guide itself, §1.3).
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'full_name, phone, avatar_url, emergency_contact_name, emergency_contact_phone, email_verified_at, last_login_at, created_at, profile_checklist_dismissed_at, active_org_id',
    )
    .eq('id', user.id)
    .single();

  if (!profile?.active_org_id) redirect('/create-organization');

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role, joined_at')
    .eq('org_id', profile.active_org_id)
    .eq('user_id', user.id)
    .maybeSingle();

  let avatarSignedUrl: string | null = null;
  if (profile.avatar_url) {
    const { data } = await supabase.storage
      .from('org-files')
      .createSignedUrl(profile.avatar_url, 3600);
    avatarSignedUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <AccountForm
        email={user.email ?? ''}
        fullName={profile.full_name}
        phone={profile.phone}
        avatarPath={profile.avatar_url}
        avatarSignedUrl={avatarSignedUrl}
        emergencyContactName={profile.emergency_contact_name}
        emergencyContactPhone={profile.emergency_contact_phone}
        emailVerifiedAt={profile.email_verified_at}
        lastLoginAt={profile.last_login_at}
        createdAt={profile.created_at}
        checklistDismissed={!!profile.profile_checklist_dismissed_at}
        orgRole={membership?.role ?? null}
        joinedAt={membership?.joined_at ?? null}
        activeOrgId={profile.active_org_id}
      />
    </div>
  );
}
