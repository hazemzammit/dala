import { Linking, Platform } from 'react-native';
import { Text, View, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { Illustration } from '@/components/ui/Illustration';

/**
 * apps/mobile/src/app/forced-update.tsx
 *
 * Doc 03 §3.1a — hard-block screen for installs below `min_supported_version`.
 * No skip, no back button, no bottom nav — this screen has no exit except
 * updating. Reached only from index.tsx's version check; never pushed from
 * anywhere else, and there's deliberately no route back out of it.
 */
const STORE_URLS = {
  ios: 'https://apps.apple.com/app/id0000000000',
  android: 'https://play.google.com/store/apps/details?id=tn.dala.app',
};

export default function ForcedUpdateScreen() {
  function openStore() {
    const url = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
    Linking.openURL(url);
  }

  return (
    <YStack
      flex={1}
      backgroundColor="$neutral25"
      alignItems="center"
      justifyContent="center"
      padding="$4"
      gap="$4"
    >
      <Illustration name="maintenance" size={180} />

      <Text fontFamily="$display" fontSize={23} fontWeight="600" textAlign="center">
        Mise à jour requise
      </Text>

      <Text color="$neutral500" fontSize={15.5} textAlign="center" maxWidth={320}>
        Une nouvelle version de Dala est nécessaire pour continuer. Cette mise à jour ne prend
        qu&apos;une minute.
      </Text>

      <View width="100%" marginTop="$2">
        <Button onPress={openStore}>Mettre à jour</Button>
      </View>
    </YStack>
  );
}
