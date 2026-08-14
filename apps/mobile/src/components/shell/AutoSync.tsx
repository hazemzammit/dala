import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { runSync } from '@/db/sync';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/components/shell/AutoSync.tsx
 *
 * Doc 03 §3.3/§3.9 offline-first sync — Phase 18. Mounted once in the root
 * layout, alongside `<OfflineBanner />` (same "one component owns this
 * cross-cutting concern, not re-implemented per screen" pattern that
 * file's own header already establishes) — this is the other half of that
 * banner's promise: it says "les modifications seront synchronisées," this
 * component is what actually makes that true, rather than requiring every
 * screen to remember to call `runSync()` itself.
 *
 * Two trigger points, both standard for offline-first mobile apps:
 *   1. App foreground (AppState background/inactive -> active) — covers
 *      "I had the app in the background over lunch, connectivity came and
 *      went, catch up now."
 *   2. Network reconnect (NetInfo offline -> online transition) — covers
 *      "I've had the app open the whole time, tunnel/elevator/dead zone,
 *      signal just came back."
 * Deliberately NOT on every NetInfo event or a polling interval — only the
 * offline->online EDGE, so this doesn't fire repeatedly while already
 * online (NetInfo's listener fires on any connection detail change, e.g.
 * wifi signal strength, not just connect/disconnect).
 *
 * Guarded on an active Supabase session — `pullChanges`/`pushChanges`
 * already no-op gracefully with no session (see pullChanges.ts's own
 * no-active-org branch), but there's no reason to even attempt the 5
 * Supabase queries before sign-in.
 *
 * Renders nothing — same shape as a "controller" component, not a UI one.
 */
export function AutoSync() {
  const wasOfflineRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    async function syncIfAuthenticated() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        await runSync();
      }
    }

    // Initial sync on mount (cold start / app relaunch).
    void syncIfAuthenticated();

    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      const isOffline = state.isConnected === false || state.isInternetReachable === false;
      if (wasOfflineRef.current && !isOffline) {
        void syncIfAuthenticated();
      }
      wasOfflineRef.current = isOffline;
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const cameToForeground =
        (appStateRef.current === 'background' || appStateRef.current === 'inactive') &&
        nextState === 'active';
      appStateRef.current = nextState;
      if (cameToForeground) {
        void syncIfAuthenticated();
      }
    });

    return () => {
      netInfoUnsubscribe();
      appStateSubscription.remove();
    };
  }, []);

  return null;
}
