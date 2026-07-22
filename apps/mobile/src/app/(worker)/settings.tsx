import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import { CaretRightIcon, SignOutIcon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/settings.tsx
 *
 * Doc 03 §4.6 — "Minimal: Profil, Téléphone, Email, Sécurité, Langue,
 * Déconnexion. No org/billing sections." Only Déconnexion is wired to a
 * real action in this pass — profile/phone/email/security/langue all need
 * the same re-verification flows as the contractor Settings screen (§3.22.1)
 * and are Phase 2/3 work, not duplicated here ahead of time.
 */
const ROWS = ['Profil', 'Téléphone', 'E-mail', 'Sécurité', 'Langue'];

export default function WorkerSettingsScreen() {
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" padding="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
        Réglages
      </Text>

      <YStack backgroundColor="$neutral0" borderRadius="$card" overflow="hidden">
        {ROWS.map((row, i) => (
          <XStack
            key={row}
            justifyContent="space-between"
            alignItems="center"
            paddingHorizontal="$4"
            paddingVertical={14}
            borderTopWidth={i === 0 ? 0 : 1}
            borderTopColor="$neutral100"
          >
            <Text fontSize={15.5}>{row}</Text>
            <CaretRightIcon size={16} color={color.neutral[500]} />
          </XStack>
        ))}
      </YStack>

      <XStack
        marginTop="$4"
        alignItems="center"
        gap="$2"
        paddingVertical={14}
        onPress={handleLogout}
        accessibilityRole="button"
      >
        <SignOutIcon size={18} color={color.status.danger} />
        <Text color="$danger" fontSize={15.5} fontWeight="500">
          Déconnexion
        </Text>
      </XStack>
    </YStack>
  );
}
