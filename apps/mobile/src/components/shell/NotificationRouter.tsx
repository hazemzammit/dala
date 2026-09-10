import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { setupNotificationResponseListener } from '@/lib/pushNotifications';

/**
 * apps/mobile/src/components/shell/NotificationRouter.tsx
 *
 * PHASE 9 §2.2 — mounted once in the root layout, alongside `<AutoSync
 * />`/`<OfflineBanner />` (same "one component owns this cross-cutting
 * concern" pattern AutoSync.tsx's own header already establishes — see
 * that file for the precedent this one is deliberately shaped after:
 * renders nothing, owns one `useEffect`, cleans up its own subscription).
 *
 * ROUTING TABLE — three push types, three landing screens, resolved from
 * this phase's own Step 1 read of each event's actual recipient (see
 * migration 0074's Part 1 header for the full reasoning):
 *   - 'dispatch'  -> /(worker)/home — the recipient is the ASSIGNED
 *     WORKER (not the contractor who created the assignment), and
 *     worker/home.tsx already surfaces "today's assignment" on its own,
 *     so no per-assignment deep param is needed to land somewhere useful.
 *   - 'material'  -> /(contractor)/materials — the recipient is an
 *     owner/manager who can approve it; the existing screen has no
 *     per-item highlight/scroll-to affordance (confirmed by reading it —
 *     not invented here), so this routes to the LIST, same honest
 *     landing spot every other "tap this app-wide notification" flow in
 *     this app already uses.
 *   - 'safety'    -> /(contractor)/safety — same reasoning as materials.
 *   - 'advance'   -> /(worker)/advance-request — audit fix 3a (migration
 *     0087). The recipient is the worker whose advance request was just
 *     approved/rejected; that screen already shows their live balance and
 *     request status, same "land on the screen that already surfaces
 *     this" reasoning as 'dispatch' above.
 * Uses expo-router's OWN file-based route table directly
 * (`router.push('/(worker)/home')` etc.) — per this phase's own Step 1
 * finding (read accept-invite.tsx and _layout.tsx before writing this):
 * there is no separate manual `dala://` URL-parsing layer to route
 * through in the first place. expo-router resolves `dala://` links to
 * these same file-based routes automatically; a notification tap just
 * needs to call `router.push()` with the in-app path, not construct or
 * parse a URL string.
 */
export function NotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    void setupNotificationResponseListener((data) => {
      switch (data.type) {
        case 'dispatch':
          router.push('/(worker)/home');
          break;
        case 'material':
          router.push('/(contractor)/materials');
          break;
        case 'safety':
          router.push('/(contractor)/safety');
          break;
        case 'advance':
          router.push('/(worker)/advance-request');
          break;
        default:
          // Unknown/older payload shape — no-op rather than guessing a
          // route, same "don't route somewhere wrong" caution every
          // other deep-link resolver in this app already applies.
          break;
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => unsubscribe?.();
    // `router` is expo-router's stable singleton, not a per-render value;
    // including it would just re-run this effect on every navigation with
    // no behavior change (AutoSync.tsx's own empty dep array follows the
    // same "this effect's job is to attach ONE subscription for the
    // component's whole lifetime" reasoning).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
