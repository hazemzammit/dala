import type { Icon } from 'phosphor-react-native';
import { DotsThreeVerticalIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Text, View, XStack, YStack } from 'tamagui';

import { NumericText } from './NumericText';
import { ProgressBar } from './Progress';

import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/ListCard.tsx
 *
 * UI/UX pass (Chantiers/Avances audit, component-architecture step) — the
 * general-purpose scannable record card the audit called for: icon/avatar
 * chip · title/subtitle · badge · optional metadata row · optional metric
 * row · optional progress bar · optional overflow action. `projects.tsx`'s
 * project cards and `advances.tsx`'s worker/payroll cards are now both
 * thin configurations of this ONE component instead of two separate
 * hand-rolled implementations — the actual mechanism that stops "cards
 * are basic text rows" from being fixed on one screen and quietly
 * regressing on the next (materials/vehicles/team are the next screens
 * that should move onto this, per the audit's roadmap step 7).
 *
 * Deliberately a single flexible component rather than per-screen
 * ProjectCard/AdvanceCard wrapper components with duplicated layout — the
 * icon-chip-vs-leading-node split (`icon`+`iconTint` OR a free-form
 * `leading` node, e.g. `<Avatar />`) is the one piece of real per-screen
 * variance; everything else (title row, metadata row, footer) is shared
 * structure.
 */
interface ListCardMetaItem {
  icon: Icon;
  label: string;
}

interface ListCardProps {
  /** Full-bleed image rendered at the top of the card, inside its border/
   * radius/background — e.g. a project's cover photo. Bug fix: screens
   * used to render this kind of image as a sibling ABOVE the card instead
   * of a slot within it, so it visually floated with no card chrome
   * around it. This slot fixes that at the shared-component level so
   * every consumer gets it right, not just the one screen that happened
   * to get patched. */
  coverImage?: ReactNode;
  /** Leading icon — rendered inside a tinted rounded-square chip. Mutually
   * exclusive with `leading` (e.g. an Avatar) — pass one or the other. */
  icon?: Icon;
  /** Hex color for the icon + its chip tint. Required when `icon` is set. */
  iconTint?: string;
  /** Free-form leading element (e.g. `<Avatar name={...} />`) for cards
   * where a person, not a category, is the subject. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** Small icon+label row under the title — address, date, role, etc. */
  metaItems?: ListCardMetaItem[];
  /** e.g. a `<StatusBadge>` — rendered top-right of the title row. */
  badge?: ReactNode;
  /** Free-form content between the header and the footer — e.g. the
   * Brut/Avances/Net column row on the Avances worker card. */
  children?: ReactNode;
  /** 0–100 — renders the shared `ProgressBar` with a label + percent. */
  progressValue?: number;
  progressLabel?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Shows a visible "⋮" affordance top-right, opening secondary actions.
   * Without this, secondary actions are only reachable by long-press,
   * which is undiscoverable — every card with a Modifier/Supprimer-style
   * menu should pass this rather than relying on `onLongPress` alone. */
  onOverflowPress?: () => void;
  overflowLabel?: string;
  /** Lower visual weight (muted surface, no border, slight opacity) for a
   * "this is settled/inactive" card — e.g. an already-paid worker cycle.
   * Status should be legible from the card's overall shape, not only a
   * small badge — never color alone (accessibility principle). */
  muted?: boolean;
}

export function ListCard({
  coverImage,
  icon: IconComponent,
  iconTint,
  leading,
  title,
  subtitle,
  metaItems,
  badge,
  children,
  progressValue,
  progressLabel = 'Progression',
  onPress,
  onLongPress,
  onOverflowPress,
  overflowLabel = "Plus d'actions",
  muted = false,
}: ListCardProps) {
  const tc = useTokenColor();

  return (
    <YStack
      backgroundColor={muted ? '$neutral25' : '$neutral0'}
      borderRadius="$card"
      borderWidth={muted ? 0 : 1}
      borderColor="$neutral100"
      overflow="hidden"
      gap={coverImage ? undefined : '$3'}
      opacity={muted ? 0.85 : 1}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? title : undefined}
    >
      {coverImage}
      <YStack padding="$4" gap="$3" paddingTop={coverImage ? '$3' : '$4'}>
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          <XStack flex={1} gap="$3" alignItems="center">
            {leading}
            {!leading && IconComponent && iconTint && (
              <View
                width={40}
                height={40}
                borderRadius={11}
                alignItems="center"
                justifyContent="center"
                backgroundColor={toRgba(iconTint, 0.14)}
              >
                <IconComponent size={20} weight="fill" color={iconTint} />
              </View>
            )}
            <YStack flex={1} gap={2}>
              <Text fontSize={16} fontWeight="600" numberOfLines={1}>
                {title}
              </Text>
              {subtitle && (
                <Text fontSize={13} color="$neutral500" numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </YStack>
          </XStack>

          <XStack gap="$2" alignItems="center">
            {badge}
            {onOverflowPress && (
              <XStack
                width={28}
                height={28}
                borderRadius={999}
                alignItems="center"
                justifyContent="center"
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  onOverflowPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={overflowLabel}
                hitSlop={8}
              >
                <DotsThreeVerticalIcon size={18} weight="bold" color={tc.neutral500} />
              </XStack>
            )}
          </XStack>
        </XStack>

        {metaItems && metaItems.length > 0 && (
          <XStack gap="$4" flexWrap="wrap">
            {metaItems.map((item, i) => (
              <XStack key={i} gap="$1.5" alignItems="center" flexShrink={1}>
                <item.icon size={13} color={tc.neutral500} />
                <Text fontSize={12.5} color="$neutral500" numberOfLines={1}>
                  {item.label}
                </Text>
              </XStack>
            ))}
          </XStack>
        )}

        {children}

        {progressValue !== null && progressValue !== undefined && (
          <YStack gap="$1.5">
            <XStack justifyContent="space-between">
              <Text fontSize={12.5} color="$neutral500">
                {progressLabel}
              </Text>
              <NumericText fontSize={12.5} fontWeight="600" color="$neutral900">
                {Math.round(progressValue)}%
              </NumericText>
            </XStack>
            <ProgressBar value={progressValue} />
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}
