import { color } from '@dala/design-tokens';
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CloudIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import { Text, XStack } from 'tamagui';

import type { MutationSyncState } from '@/lib/useMutationSyncState';

/**
 * apps/mobile/src/components/ui/MutationSyncIndicator.tsx
 *
 * Doc 05 §1.7p — the per-action half of the offline mutation state
 * machine. Deliberately small, inline, and worded around the specific
 * action ("Votre arrivée…") rather than `OfflineBanner`'s full-width,
 * generic, top-of-screen bar — the spec requires these stay visibly
 * distinct, not two copies of the same treatment.
 */
interface MutationSyncIndicatorProps {
  state: MutationSyncState;
  /** What to call this action in copy, e.g. "arrivée". */
  actionLabel: string;
  onRetry?: () => void;
}

export function MutationSyncIndicator({ state, actionLabel, onRetry }: MutationSyncIndicatorProps) {
  if (state === 'idle' || state === 'saving') return null;

  if (state === 'saved') {
    return (
      <XStack alignItems="center" gap="$1.5">
        <CloudIcon size={13} color={color.neutral[500]} />
        <Text fontSize={12.5} color="$neutral500">
          Enregistré — en attente de synchronisation
        </Text>
      </XStack>
    );
  }

  if (state === 'syncing') {
    return (
      <XStack alignItems="center" gap="$1.5">
        <ArrowsClockwiseIcon size={13} color={color.accent[600]} />
        <Text fontSize={12.5} color="$accent600">
          Synchronisation de votre {actionLabel}…
        </Text>
      </XStack>
    );
  }

  if (state === 'synced') {
    return (
      <XStack alignItems="center" gap="$1.5">
        <CheckCircleIcon size={13} weight="fill" color={color.status.success} />
        <Text fontSize={12.5} color="$success">
          Votre {actionLabel} est synchronisée
        </Text>
      </XStack>
    );
  }

  return (
    <XStack
      alignItems="center"
      gap="$1.5"
      onPress={onRetry}
      accessibilityRole={onRetry ? 'button' : undefined}
      accessibilityLabel={
        onRetry
          ? `Échec de synchronisation de votre ${actionLabel}. Toucher pour réessayer.`
          : undefined
      }
    >
      <WarningCircleIcon size={13} weight="fill" color={color.status.danger} />
      <Text fontSize={12.5} color="$danger" textDecorationLine={onRetry ? 'underline' : 'none'}>
        Échec de synchronisation{onRetry ? ' — toucher pour réessayer' : ''}
      </Text>
    </XStack>
  );
}
