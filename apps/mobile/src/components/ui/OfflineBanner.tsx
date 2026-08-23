import NetInfo from '@react-native-community/netinfo';
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  WifiSlashIcon,
} from 'phosphor-react-native';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { Text, XStack } from 'tamagui';

import { runSync } from '@/db/sync';
import { getSyncStatusSnapshot, subscribeSyncStatus } from '@/lib/syncStatus';

/**
 * apps/mobile/src/components/ui/OfflineBanner.tsx
 *
 * Doc 01 §1.9 — this app's whole conflict-handling philosophy is
 * non-blocking (see Dispatch's inline "Modifié ailleurs" resolution, never
 * a blocking modal). Being offline is the same category of thing, not an
 * error: a calm, persistent strip, not a dialog or a toast that
 * disappears before anyone reads it. Mounted once in the root layout so
 * it's visible above every screen (auth, contractor, worker) rather than
 * re-implemented per screen.
 *
 * `isInternetReachable` starts `null` on first read (NetInfo hasn't
 * resolved yet) — treated as "online" rather than flashing the banner on
 * every cold start before the first real reading arrives.
 *
 * PHASE 1 (improvement-plan §5.2) — extended, per the plan's own explicit
 * instruction, into a persistent sync-status indicator rather than a new
 * component built alongside it: `pointage.tsx`'s `handleSave()` and
 * `AutoSync.tsx` both fire `void runSync()` and discard the result, so a
 * sync failure was only ever visible in Sentry, never to the person whose
 * data didn't actually save. Four states, offline taking priority since a
 * sync can't be in progress while offline:
 *
 *   1. Offline           — unchanged text/look from before this phase.
 *   2. Synchronisation…  — a sync is in flight (`markSyncStarted()`).
 *   3. Synchronisé       — the most recent sync succeeded; shown for a
 *      few seconds then the banner clears, exactly like a toast would,
 *      except this is state driven by the store, not a fire-and-forget
 *      timer race with a screen unmounting.
 *   4. Échec de synchronisation — the most recent sync failed; PERSISTS
 *      (unlike state 3) until the next sync attempt succeeds, and is
 *      tappable for the underlying error message plus a manual retry —
 *      "tap for detail" from the plan's own wording.
 *
 * Reads `lib/syncStatus.ts` via `useSyncExternalStore` — that store is
 * updated by `runSync()` itself (see db/sync/index.ts), so EVERY existing
 * `void runSync()` call site across the app becomes visible here, not just
 * the two this phase was scoped to touch. See syncStatus.ts's header for
 * why that was the deliberate choice over duplicating tracking logic in
 * each caller.
 */
const SUCCESS_DISPLAY_MS = 3000;

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const syncStatus = useSyncExternalStore(subscribeSyncStatus, getSyncStatusSnapshot);
  const [showSuccess, setShowSuccess] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (syncStatus.phase !== 'success') return;
    setShowSuccess(true);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setShowSuccess(false), SUCCESS_DISPLAY_MS);
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [syncStatus.phase, syncStatus.lastSyncedAt]);

  function handleErrorTap() {
    Alert.alert(
      'Échec de synchronisation',
      syncStatus.lastError ?? "Les dernières modifications n'ont pas pu être envoyées au serveur.",
      [
        { text: 'Fermer', style: 'cancel' },
        { text: 'Réessayer', onPress: () => void runSync() },
      ],
    );
  }

  if (offline) {
    return (
      <XStack
        backgroundColor="$neutral900"
        paddingVertical={8}
        paddingHorizontal="$4"
        alignItems="center"
        justifyContent="center"
        gap="$2"
      >
        <WifiSlashIcon size={14} color="white" />
        <Text color="white" fontSize={12.5} fontWeight="500">
          Hors ligne — les modifications seront synchronisées
        </Text>
      </XStack>
    );
  }

  if (syncStatus.phase === 'syncing') {
    return (
      <XStack
        // accent600, not neutral900 — this palette's neutral scale only
        // defines 0/25/100/200/300/500/900 (see design-tokens/src/index.ts),
        // no 700 step. accent600 (brand teal) also reads correctly here:
        // "syncing" is an active/informational state, distinct from
        // offline's more severe near-black bar and from success/error's
        // status colors.
        backgroundColor="$accent600"
        paddingVertical={8}
        paddingHorizontal="$4"
        alignItems="center"
        justifyContent="center"
        gap="$2"
      >
        <ArrowsClockwiseIcon size={14} color="white" />
        <Text color="white" fontSize={12.5} fontWeight="500">
          Synchronisation…
        </Text>
      </XStack>
    );
  }

  if (syncStatus.phase === 'error') {
    return (
      <XStack
        backgroundColor="$danger"
        paddingVertical={8}
        paddingHorizontal="$4"
        alignItems="center"
        justifyContent="center"
        gap="$2"
        onPress={handleErrorTap}
        accessibilityRole="button"
        accessibilityLabel="Échec de synchronisation. Toucher pour les détails."
      >
        <WarningCircleIcon size={14} weight="fill" color="white" />
        <Text color="white" fontSize={12.5} fontWeight="500">
          Échec de synchronisation — toucher pour réessayer
        </Text>
      </XStack>
    );
  }

  if (showSuccess) {
    return (
      <XStack
        backgroundColor="$success"
        paddingVertical={8}
        paddingHorizontal="$4"
        alignItems="center"
        justifyContent="center"
        gap="$2"
      >
        <CheckCircleIcon size={14} weight="fill" color="white" />
        <Text color="white" fontSize={12.5} fontWeight="500">
          Synchronisé
        </Text>
      </XStack>
    );
  }

  return null;
}
