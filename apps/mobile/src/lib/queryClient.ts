import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * apps/mobile/src/lib/queryClient.ts
 *
 * PHASE 1 (improvement-plan §5.1) — `@tanstack/react-query` was an
 * installed, never-imported dependency; this is the first real use.
 * `docs/PHASE_1_BRIEF.md` covers which screens were migrated first and
 * why. This file is the ONE QueryClient instance for the app, created
 * once at module scope (not inside a component) so it survives
 * fast-refresh and every screen shares the same cache.
 *
 * React Query's defaults (`refetchOnWindowFocus`, `refetchOnReconnect`)
 * are written for a browser's `window`/`navigator.onLine` events, which
 * don't exist in React Native — without the two wiring calls below, those
 * defaults are silent no-ops on mobile, not just "less effective." This
 * app already depends on `@react-native-community/netinfo` (OfflineBanner,
 * AutoSync) and `AppState` (AutoSync) for exactly this kind of signal, so
 * this reuses both rather than adding a new dependency:
 *
 *   - `onlineManager` <- NetInfo: a query that failed while offline
 *     refetches the instant connectivity returns, same edge AutoSync
 *     already treats as "worth syncing again."
 *   - `focusManager` <- AppState: "app came to the foreground" is this
 *     app's equivalent of a browser tab regaining focus — a screen whose
 *     data might be stale after minutes backgrounded refetches on resume,
 *     same edge AutoSync treats as "worth syncing again." `focusManager`
 *     defaults to always-focused on native platforms unless told
 *     otherwise, so this call is required, not optional, for
 *     `refetchOnWindowFocus` to ever do anything on this app.
 *
 * `staleTime: 30_000` — a deliberate default, not zero: most screens in
 * this app are read by one contractor at a time (multi-user simultaneity
 * only matters on the few screens §5.1 step 3 calls out for Realtime,
 * which Phase 1 does not add) — treating data as fresh for 30s avoids a
 * refetch on every single screen focus while `useFocusEffect` navigation
 * was doing exactly that before. `retry: 2` matches this being a mobile
 * network, where a single transient failure shouldn't immediately show
 * ErrorState.
 */
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });
});

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

export function attachQueryClientAppStateListener(): () => void {
  const subscription = AppState.addEventListener('change', onAppStateChange);
  return () => subscription.remove();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
