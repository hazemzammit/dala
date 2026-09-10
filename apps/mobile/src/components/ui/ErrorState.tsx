import { ArrowClockwiseIcon, type Icon } from 'phosphor-react-native';
import { Text, View, YStack } from 'tamagui';

import { Button } from './Button';
import { Icon3D } from './Icon3D';
import type { Icon3DName } from './icons3d';
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
 * `retryLabel` defaults to "Réessayer" so the common case
 * (`<ErrorState onRetry={refetch} />`) needs no other prop, while still
 * allowing a screen-specific illustration/title/description when the
 * generic wording doesn't fit.
 *
 * IMPROVEMENT-PLAN Part A — the old Phosphor `WarningCircleIcon` badge
 * default is replaced with Icon3D's `x-circle` as the new generic-failure
 * default (confirmed across every call site in the app: ~25+ bare
 * `<ErrorState onRetry={...} />` uses with no `icon`/`illustration`
 * override — all of them pick this up automatically). `illustration` still
 * wins when a screen sets one (vehicles.tsx and pointage.tsx already have
 * bespoke `illustration="warning"` + custom copy — left untouched, that's
 * a richer treatment already, not the generic gap this default addresses).
 * New `icon3d` prop lets a screen ask for a specific Icon3D instead of the
 * x-circle default without dropping to the old Phosphor `icon` escape
 * hatch — used at analytics.tsx for `warning-circle`, the one guide-named
 * target screen that actually had zero customization before this.
 */
interface ErrorStateProps {
  icon?: Icon;
  icon3d?: Icon3DName;
  illustration?: IllustrationName;
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry: () => void;
}

export function ErrorState({
  icon: IconComponent,
  icon3d,
  illustration,
  title = 'Un problème est survenu',
  description = 'Impossible de charger ces données. Vérifiez votre connexion et réessayez.',
  retryLabel = 'Réessayer',
  onRetry,
}: ErrorStateProps) {
  return (
    <YStack alignItems="center" justifyContent="center" paddingHorizontal="$4" paddingVertical={48}>
      {illustration ? (
        <Illustration name={illustration} size={168} />
      ) : IconComponent ? (
        <PhosphorBadge Icon={IconComponent} />
      ) : (
        <Icon3D name={icon3d ?? 'x-circle'} />
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

/**
 * Kept for the `icon` escape hatch — no call site in the app currently
 * uses it (every existing usage was relying on the old default, which is
 * now Icon3D's `x-circle`), but a screen that genuinely wants a flat
 * Phosphor glyph instead of a 3D render still can.
 */
function PhosphorBadge({ Icon: IconComponent }: { Icon: Icon }) {
  const tc = useTokenColor();
  return (
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
  );
}
