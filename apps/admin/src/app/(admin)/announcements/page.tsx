'use client';

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
 */
export default function AnnouncementsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Annonces</h1>
      <AnnouncementForm onPublished={() => setRefreshKey((k) => k + 1)} />
      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">Historique</h2>
        <AnnouncementsList refreshKey={refreshKey} />
      </div>
    </div>
  );
}
