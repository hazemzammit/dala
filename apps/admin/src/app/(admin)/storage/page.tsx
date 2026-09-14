import { PageHero } from '@dala/ui-web';
import { HardDrivesIcon } from '@phosphor-icons/react/ssr';
import { Suspense } from 'react';

import { StorageUsageTable } from './StorageUsageTable';

/**
 * Doc 06 §6.3 — Storage Monitor.
 *
 * Real per-org rollup, computed from storage.objects via
 * admin_storage_usage_by_org() (migration 0026) — see that migration's
 * header comment and the API route for why this isn't backed by an
 * `organizations.storage_used_mb` counter (no such column exists; Doc 03
 * §3.7 describes one but it was never implemented anywhere in this repo).
 *
 * Overage flagging is now built (this session): Doc 00 §0.3 item 7 defines
 * the free-tier policy (800MB banner+email, 950MB queued-upload warning,
 * 1GB read-only + upgrade prompt) — this screen flags each 'free'-plan org
 * against those thresholds. 'pro'/'business' orgs show "Pas de seuil
 * défini" since no numeric limit exists for those plans anywhere in Doc
 * 00/03 — this screen doesn't invent one.
 *
 * Phase 5 (plan §5.9) — the bare <h1> + <p> becomes a PageHero (icon
 * HardDrivesIcon, same title "Surveillance du stockage"); the existing
 * threshold-explainer paragraph moves into `description` verbatim (the
 * two inline <code> tags are dropped — PageHero's description is a
 * string prop — the text is unchanged).
 */
export default function StorageMonitorPage() {
  return (
    <div>
      <PageHero
        icon={HardDrivesIcon}
        title="Surveillance du stockage"
        description="Utilisation du stockage par organisation, avec seuils d'alerte."
      />
      {/* Tier 4.4 / Phase 5.3 — same useSearchParams()-requires-Suspense
          reasoning as apps/(admin)/users/page.tsx. */}
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <StorageUsageTable />
      </Suspense>
    </div>
  );
}
