import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import type { Icon } from 'phosphor-react-native';
import { Text, View, YStack } from 'tamagui';

import { Button } from './Button';
import { Illustration } from './Illustration';
import type { IllustrationName } from './illustrations';

/**
 * apps/mobile/src/components/ui/EmptyState.tsx
 *
 * Doc 05 §4 — illustration + headline + primary CTA. Web equivalent:
 * apps/web/src/components/ui/EmptyState.tsx. No RSC boundary concerns on
 * mobile (everything here is one client-side tree), so unlike web's
 * actionHref/onAction split, a single actionHref (expo-router path) is
 * enough — router.push works from anywhere in the tree.
 *
 * `illustration` takes priority over `icon` when both are given — pass an
 * unDraw illustration name for the real empty-state artwork; `icon` alone
 * (the pre-illustration behavior, a filled accent circle) still works for
 * any spot that hasn't been assigned an illustration yet.
 */
interface EmptyStateProps {
  icon: Icon;
  illustration?: IllustrationName;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon: IconComponent,
  illustration,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <YStack alignItems="center" justifyContent="center" paddingHorizontal="$4" paddingVertical={48}>
      {illustration ? (
        <Illustration name={illustration} size={168} />
      ) : (
        <View
          width={64}
          height={64}
          borderRadius={999}
          backgroundColor="$accent50"
          alignItems="center"
          justifyContent="center"
        >
          <IconComponent size={28} color={color.accent[600]} />
        </View>
      )}

      <Text fontFamily="$display" fontSize={18} fontWeight="600" marginTop="$3" textAlign="center">
        {title}
      </Text>

      {description && (
        <Text color="$neutral500" fontSize={14} marginTop="$1.5" textAlign="center" maxWidth={320}>
          {description}
        </Text>
      )}

      {actionLabel && actionHref && (
        <View marginTop="$4">
          <Button fullWidth={false} onPress={() => router.push(actionHref as never)}>
            {actionLabel}
          </Button>
        </View>
      )}
    </YStack>
  );
}
