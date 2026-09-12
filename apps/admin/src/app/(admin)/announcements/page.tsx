'use client';

import { PageHero, SectionCard } from '@dala/ui-web';
import { MegaphoneIcon } from '@phosphor-icons/react/ssr';
import { useState } from 'react';

import { AnnouncementForm } from './AnnouncementForm';
import { AnnouncementsList } from './AnnouncementsList';

/**
 * Doc 06 §6.3 — Announcements authoring + push delivery.
 *
 * Push delivery is real as of migration 0030: send-announcement-
 * notifications (Edge Function, cron every 5 min) resolves recipients and
 * sends via Expo Push, logged in announcement_deliveries. In-app banner
 * delivery has a real DB-side read contract (get_active_in_app_announcements(),
 * 0030) but no rendered UI here — that's apps/web's / apps/mobile's own
 * screen to build against it, not apps/admin's. Email channel selection is
 * still authoring-intent only; no Resend send is wired for it yet.
 *
 * Phase 5 (plan §5.13) — bare <h1> becomes a PageHero (icon MegaphoneIcon,
 * same title "Annonces", no description — none exists today and none is
 * invented); the bare <h2> "Historique" wrapper becomes a tone-less
 * SectionCard with the same title verbatim (Level-1 surface per Phase 4.6).
 */
export default function AnnouncementsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <PageHero icon={MegaphoneIcon} title="Annonces" />
      <AnnouncementForm onPublished={() => setRefreshKey((k) => k + 1)} />
      <SectionCard title="Historique">
        <AnnouncementsList refreshKey={refreshKey} />
      </SectionCard>
    </div>
  );
}
