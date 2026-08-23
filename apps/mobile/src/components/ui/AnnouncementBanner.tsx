import { color } from '@dala/design-tokens';
import { MegaphoneIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Text, XStack } from 'tamagui';

import { supabase } from '@/lib/supabase';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // matches apps/web's AnnouncementBanner —
// a broadcast banner, not real-time chat, coarse interval per the
// remediation plan's own guidance.

interface ActiveAnnouncement {
  id: string;
  message: string;
  published_at: string;
}

/**
 * apps/mobile/src/components/ui/AnnouncementBanner.tsx
 *
 * Admin remediation Tier 2.2 — mobile half of the gap migration 0030's own
 * header flagged as apps/web's/apps/mobile's job to build (the DB-side
 * get_active_in_app_announcements() contract already existed; nothing
 * called it). See apps/web's AnnouncementBanner.tsx for the fuller
 * reasoning on "highest-priority = most recent" and the in-memory-only
 * dismissal choice — both apply identically here.
 *
 * STACKING WITH OfflineBanner, resolved rather than left to guesswork
 * (Doc 05's component inventory doesn't cover this new banner at all, so
 * there's no spec answer to defer to): this renders BELOW OfflineBanner
 * when both are visible, never replacing it. Connectivity loss is the
 * more urgent, blocking-adjacent condition of the two — a contractor
 * needs to know their writes aren't syncing before they need to read a
 * broadcast announcement. If ever offline, OfflineBanner already takes
 * the top slot; this occupying a slot below it just means an announcement
 * momentarily costs one more line of vertical space, not that it's ever
 * hidden entirely.
 *
 * Root-layout mount (not contractor-only, unlike PastDueBanner): target_
 * type='all_users' in resolve_announcement_recipients() (0030) resolves
 * to every `profiles` row — worker accounts included, not just contractor
 * owner/manager accounts — so scoping this to the contractor layout the
 * way PastDueBanner does (billing has no worker-account concept, Doc 03
 * §4.6) would silently miss a real target audience for this specific
 * feature.
 */
export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<ActiveAnnouncement[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Granted to `authenticated` only (0030) — a call before session
      // resolution (this mounts in the root layout, above auth screens
      // too) simply errors here, treated as "nothing to show."
      const { data, error } = await supabase.rpc('get_active_in_app_announcements');
      if (!cancelled && !error && data) setAnnouncements(data);
    }

    void load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const active = announcements.find((a) => !dismissedIds.has(a.id));
  if (!active) return null;

  return (
    <XStack
      backgroundColor="$accent50"
      paddingVertical={8}
      paddingHorizontal="$4"
      alignItems="center"
      justifyContent="space-between"
      gap="$2"
    >
      <XStack flex={1} alignItems="center" gap="$2">
        <MegaphoneIcon size={14} color={color.accent[700]} weight="fill" />
        <Text color="$accent700" fontSize={12.5} fontWeight="500" flex={1}>
          {active.message}
        </Text>
      </XStack>
      <XStack
        onPress={() => setDismissedIds((prev) => new Set(prev).add(active.id))}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        padding={4}
      >
        <XIcon size={14} color={color.accent[700]} />
      </XStack>
    </XStack>
  );
}
