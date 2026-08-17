import { CaretDownIcon, CaretUpIcon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { NumericText } from '@/components/ui/NumericText';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { SparklineBars, SparklineLine } from '@/components/ui/Sparkline';
import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/StatCard.tsx
 *
 * Doc 05 §4's component inventory names this as "the single most-reused
 * component across both apps" — hero number + label + delta chip + optional
 * sparkline, default/loading(skeleton)/empty states — but it was never
 * actually built; Dashboard's Phase 23 pass explicitly cut the weekly-cash
 * card that would have used it. Phase 24 builds it for real.
 *
 * Doc 05 §2.2: "pick bars for money, lines for progress/time metrics" —
 * exposed here as `sparklineVariant`, defaulting to bars.
 */
interface StatCardProps {
  label: string;
  value: string | number;
  /** e.g. "TND", "%", "j" — rendered smaller, right after the value. */
  unit?: string;
  /** Positive/negative percent or absolute delta vs. the prior period. */
  delta?: number;
  deltaSuffix?: string; // e.g. "%" or " TND"
  sparklineData?: number[];
  sparklineVariant?: 'bars' | 'line';
  loading?: boolean;
  onPress?: () => void;
}

export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaSuffix = '%',
  sparklineData,
  sparklineVariant = 'bars',
  loading = false,
  onPress,
}: StatCardProps) {
  if (loading) {
    return (
      <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
        <SkeletonBlock width="45%" height={13} />
        <SkeletonBlock width="60%" height={36} />
        {sparklineData !== undefined && <SkeletonBlock width="100%" height={32} radius={8} />}
      </YStack>
    );
  }

  const isPositive = (delta ?? 0) >= 0;
  const tc = useTokenColor();
  const deltaColor = isPositive ? tc.success : tc.danger;
  // Dark-mode pass — this used to be a hand-picked light pastel
  // ('#EAF7EF'/'#FBEAE9') matching no token at all, so it stayed
  // light-mode-colored regardless of theme. Now derived from the same
  // theme-resolved success/danger value the icon and text use, tinted via
  // the shared `toRgba` helper.
  const Sparkline = sparklineVariant === 'line' ? SparklineLine : SparklineBars;

  return (
    <YStack
      backgroundColor="$neutral0"
      borderRadius="$card"
      padding="$4"
      gap="$2"
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text
        fontSize={13}
        fontWeight="600"
        color="$neutral500"
        textTransform="uppercase"
        letterSpacing={0.4}
      >
        {label}
      </Text>

      <XStack alignItems="flex-end" justifyContent="space-between">
        <XStack alignItems="baseline" gap={4}>
          <NumericText fontFamily="$display" fontSize={34} fontWeight="600" lineHeight={38}>
            {value}
          </NumericText>
          {unit && (
            <Text fontSize={15} color="$neutral500" fontWeight="500">
              {unit}
            </Text>
          )}
        </XStack>

        {sparklineData && sparklineData.length > 0 && (
          <Sparkline data={sparklineData} width={90} height={30} />
        )}
      </XStack>

      {delta !== undefined && (
        <XStack
          alignSelf="flex-start"
          alignItems="center"
          gap={2}
          paddingHorizontal={8}
          paddingVertical={3}
          borderRadius={999}
          backgroundColor={toRgba(deltaColor, 0.12)}
        >
          {isPositive ? (
            <CaretUpIcon size={11} weight="bold" color={deltaColor} />
          ) : (
            <CaretDownIcon size={11} weight="bold" color={deltaColor} />
          )}
          <Text fontSize={12} fontWeight="600" color={deltaColor}>
            {Math.abs(delta)}
            {deltaSuffix}
          </Text>
        </XStack>
      )}
    </YStack>
  );
}
