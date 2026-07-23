import NetInfo from '@react-native-community/netinfo';
import { WifiSlashIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Text, XStack } from 'tamagui';

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
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  if (!offline) return null;

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
