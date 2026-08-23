'use client';

import { XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min — a broadcast banner, not
// real-time chat; no need to check on every navigation. Matches the
// remediation plan's own "coarse interval" guidance.

interface ActiveAnnouncement {
  id: string;
  message: string;
  published_at: string;
}

/**
 * apps/web/src/components/shell/AnnouncementBanner.tsx
 *
 * Admin remediation Tier 2.2 — closes the gap migration 0030's own header
 * names explicitly: that migration built get_active_in_app_announcements()
 * as a DB-side read contract and said rendering the actual banner was
 * "explicitly out of scope for apps/admin," left for apps/web/apps/mobile
 * to build. This is that piece, for apps/web.
 *
 * "Highest-priority active announcement": announcements has no priority/
 * severity column (confirmed by reading 0022's schema before writing this
 * — only message/channels/target_type/scheduled_for/published_at), so
 * this reads "priority" as "most recent," matching the RPC's own
 * `order by published_at desc` — the first row IS the highest-priority
 * one by that ordering, not a separate client-side sort.
 *
 * Dismissal: in-memory component state only, NOT a DB write and NOT
 * client storage (localStorage/similar) either — checked Doc 01 §1.16 and
 * Doc 05 §3.6 for an explicit persistence requirement before assuming
 * this was safe to skip; neither specifies one for this specific banner
 * (unlike, say, the permanently-dismissible profile-completion checklist,
 * which Doc 01 §1.3.12 explicitly requires to persist on `profiles`).
 * A dismissed announcement reappearing after a page reload is therefore a
 * disclosed, spec-consistent trade-off, not a silent gap — same reasoning
 * the remediation plan itself gave.
 */
export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<ActiveAnnouncement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      // get_active_in_app_announcements() is granted to `authenticated`
      // only (0030) — an unauthenticated call (e.g. this component
      // mounting on a screen reached before session resolution) simply
      // errors here, which is treated as "nothing to show," not surfaced
      // to the user as a failure.
      const { data, error } = await supabase.rpc('get_active_in_app_announcements');
      if (!error && data) setAnnouncements(data);
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const active = announcements.find((a) => !dismissedIds.has(a.id));
  if (!active) return null;

  return (
    <div className="bg-accent-50 border-accent-100 flex items-center justify-between gap-4 border-b px-6 py-2.5">
      <p className="text-accent-900 text-sm">{active.message}</p>
      <button
        onClick={() => setDismissedIds((prev) => new Set(prev).add(active.id))}
        aria-label="Fermer"
        className="text-accent-700 hover:text-accent-900 shrink-0"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}
