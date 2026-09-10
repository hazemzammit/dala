import { color } from '@dala/design-tokens';
import { deleteAccountConfirmSchema } from '@dala/validation';
import { router } from 'expo-router';
import { ArrowLeftIcon, WarningIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/delete-account.tsx
 *
 * Phase 7 — Doc 03 §3.22 "Supprimer mon compte."
 *
 * Two-step flow: request_account_deletion() RPC (migration 0028) validates
 * the sole-owner-elsewhere invariant and stamps profiles, then the
 * delete-account Edge Function (service-role) performs the actual
 * auth.admin.deleteUser call a client can never make itself. Typing the
 * exact word "SUPPRIMER" is the only safeguard — deliberately no 30-day
 * grace period the way Trash gives projects/workers (Doc 01 §1.16); the
 * spec frames this as an immediate, serious action, not an undo-able one.
 *
 * IMPROVEMENT-PLAN Part A — `trash-warning` Icon3D added as a large,
 * centered hero above the warning card. There was already a small inline
 * Phosphor `WarningIcon` inside that card (so this screen wasn't literally
 * icon-free the way the guide's "currently blank" implies) — that stays
 * as-is; it's doing a different, more specific job (flagging that one
 * paragraph) than the large confirmation moment this action's severity
 * calls for.
 */
export default function DeleteAccountScreen() {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setError(null);
    const parsed = deleteAccountConfirmSchema.safeParse({ confirmation });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confirmation requise.');
      return;
    }

    setBusy(true);

    const { error: requestError } = await supabase.rpc('request_account_deletion');
    if (requestError) {
      setBusy(false);
      setError(requestError.message);
      haptics.error();
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke('delete-account');
    setBusy(false);

    if (fnError || (data as { error?: string } | null)?.error) {
      setError(
        (data as { error?: string } | null)?.error ??
          'Impossible de supprimer le compte. Réessayez.',
      );
      haptics.error();
      return;
    }

    await supabase.auth.signOut();
    router.replace('/login' as never);
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack paddingHorizontal="$4" paddingBottom="$3" alignItems="center" gap="$3">
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={20} />
        </XStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600">
          Supprimer mon compte
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <YStack gap="$4">
          <YStack alignItems="center">
            <Icon3D name="trash-warning" />
          </YStack>

          <XStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            gap="$3"
            alignItems="flex-start"
          >
            <WarningIcon size={20} color={color.status.danger} />
            <YStack flex={1} gap="$1.5">
              <Text fontSize={15} fontWeight="600">
                Cette action est irréversible
              </Text>
              <Text fontSize={13.5} color="$neutral500">
                Votre compte et votre accès à toutes vos organisations seront supprimés
                définitivement. Si vous êtes seul propriétaire d'une organisation, transférez-en la
                propriété avant de continuer.
              </Text>
            </YStack>
          </XStack>

          <FormField
            label='Tapez "SUPPRIMER" pour confirmer'
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
          />

          {error && (
            <Text fontSize={13} color="$danger">
              {error}
            </Text>
          )}

          <Button variant="secondary" onPress={() => void handleDelete()} loading={busy}>
            Supprimer définitivement mon compte
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
