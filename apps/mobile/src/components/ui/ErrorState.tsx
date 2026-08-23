import { ArrowClockwiseIcon, type Icon, WarningCircleIcon } from 'phosphor-react-native';
import { Text, View, YStack } from 'tamagui';

import { Button } from './Button';
import { Illustration } from './Illustration';
import type { IllustrationName } from './illustrations';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/ErrorState.tsx
 *
 * PHASE 1 (improvement-plan §5.3) — no generic error/retry component
 * existed anywhere in the kit before this (only `EmptyState` and
 * `SkeletonList`), so a failed `load()` either left the skeleton showing
 * forever or resolved to an empty list indistinguishable from genuinely-
 * no-data. Deliberately built as `EmptyState`'s sibling, not a variant of
 * it: same layout shell (illustration-or-icon, title, description,
 * primary action), same props shape, same `useTokenColor()` icon-circle
 * fallback — a screen can swap one for the other without re-learning a
 * different API. The one structural difference is the action: `EmptyState`
 * navigates (`actionHref`), `ErrorState` retries in place (`onRetry`) —
 * retrying a failed load should never leave the current screen.
 *
 * Pairs with §5.1's `useQuery` adoption: `isLoading` / `isError` / `data`
 * map directly onto `SkeletonList` / `ErrorState` / real content — three
 * always-distinguishable states, `refetch` passed straight through as
 * `onRetry`. Still usable standalone by any screen that hasn't migrated to
 * React Query yet — `onRetry` just needs to re-run whatever `load()` is.
 *
 * Defaults `icon` to `WarningCircleIcon` and `retryLabel` to "Réessayer" so
 * the common case (`<ErrorState onRetry={refetch} />`) needs no other
 * prop, while still allowing a screen-specific illustration/title/
 * description when the generic wording doesn't fit.
 */
interface ErrorStateProps {
  icon?: Icon;
  illustration?: IllustrationName;
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry: () => void;
}

export function ErrorState({
  icon: IconComponent = WarningCircleIcon,
  illustration,
  title = 'Un problème est survenu',
  description = 'Impossible de charger ces données. Vérifiez votre connexion et réessayez.',
  retryLabel = 'Réessayer',
  onRetry,
}: ErrorStateProps) {
  const tc = useTokenColor();
  return (
    <YStack alignItems="center" justifyContent="center" paddingHorizontal="$4" paddingVertical={48}>
      {illustration ? (
        <Illustration name={illustration} size={168} />
      ) : (
        <View
          width={64}
          height={64}
          borderRadius={999}
          backgroundColor="$neutral100"
          alignItems="center"
          justifyContent="center"
        >
          <IconComponent size={28} weight="fill" color={tc.danger} />
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

      <View marginTop="$4">
        {/* Button's `children` is typed as a plain string and it already
            renders an optional leading icon itself (with the correct
            per-variant color resolution — Phosphor icons need a resolved
            hex, not a Tamagui token string) — reusing that prop instead of
            composing icon+text manually here. */}
        <Button fullWidth={false} variant="secondary" icon={ArrowClockwiseIcon} onPress={onRetry}>
          {retryLabel}
        </Button>
      </View>
    </YStack>
  );
}
