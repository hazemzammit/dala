import { EmptyState } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { DownloadSimpleIcon } from '@phosphor-icons/react/ssr';
import { redirect } from 'next/navigation';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/server';

import { DataExportForm } from './DataExportForm';

/**
 * apps/web/src/app/(contractor)/settings/data-export/page.tsx
 *
 * Gap-closure guide §1.4 — web equivalent of mobile's data-export.tsx.
 * Same owner/manager-only gate (this export includes financial rows), same
 * `export-org-data` Edge Function + `requestDataExportSchema`.
 *
 * Delivery mechanism differs from mobile on purpose: mobile uses
 * `Share.share()` as a stated scope-cut to avoid two new native deps
 * (expo-file-system + expo-sharing). Web has a real file-download
 * primitive built into the browser (Blob + anchor click) that needs no
 * new dependency either — so this uses that instead of trying to
 * replicate a mobile share-sheet, which wouldn't make sense on desktop.
 * Same export content and format choice either way.
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

  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', profile.active_org_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const allowed = membership?.role === 'owner' || membership?.role === 'manager';

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        icon={DownloadSimpleIcon}
        title="Exporter mes données"
        description="Téléchargez l'ensemble des données de votre entreprise au format de votre choix."
      />
      {allowed ? (
        <DataExportForm orgId={profile.active_org_id} />
      ) : (
        <SectionCard title="Export des données">
          <EmptyState
            icon={DownloadSimpleIcon}
            title="Réservé au propriétaire ou gestionnaire"
            description="Seuls les rôles Propriétaire et Gestionnaire peuvent exporter les données de l'entreprise, car cet export inclut des informations financières."
          />
        </SectionCard>
      )}
    </div>
  );
}
