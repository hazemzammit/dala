'use client';

import { useState } from 'react';

import { AnnouncementForm } from './AnnouncementForm';
import { AnnouncementsList } from './AnnouncementsList';

/**
 * Doc 04 §4.3.10 — Announcements authoring. Delivery (rendering the banner
 * in mobile/web, actually sending email/push) is a separate consumer of
 * the `announcements` table (0022) — not built here.
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
