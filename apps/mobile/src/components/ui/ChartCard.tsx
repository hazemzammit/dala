import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/ui/ChartCard.tsx
 *
 * IMPROVEMENT-PLAN PHASE 7 (§2.3) — `analytics.tsx` assembles eight
 * `Chart.tsx` charts, each inside the exact same
 * `YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4"`
 * chrome that `expenses.tsx`'s category-breakdown card and `dashboard.tsx`'s
 * hero `StatCard` already use inline, uppercase-label-plus-content shape —
 * see `docs/ARCHITECTURE.md`'s "UI component inventory" for the "check
 * before writing a new one" convention this follows. Repeating that same
 * five-prop `YStack` eight times in one screen (plus a title `Text` with
 * the same `fontSize={13} fontWeight="600" color="$neutral500"
 * textTransform="uppercase"` styling each time) is exactly the drift that
 * inventory note exists to prevent — factored out once here rather than
 * copy-pasted eight times.
 *
 * Deliberately minimal: title + optional subtitle (used throughout this
 * phase to disclose each chart's trailing window, e.g. "6 derniers mois")
 * + children. No built-in loading/error/empty state — `analytics.tsx`
 * handles all three once at the screen level (matching the established
 * `SkeletonList`/`ErrorState`/content three-state pattern from
 * `docs/ARCHITECTURE.md`'s "Mobile data-fetching" section), so a chart
 * card that renders at all always has data; no per-card skeleton needed.
 */
interface ChartCardProps {
  title: string;
  /** e.g. "6 derniers mois", "30 derniers jours" — discloses the window a
   * chart's numbers are computed over, since none of these charts expose
   * an interactive date-range picker this phase (see PHASE_7_BRIEF.md). */
  subtitle?: string;
  children: ReactNode;
}

export function ChartCard({ title, subtitle, children }: ChartCardProps) {
  return (
    <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
      <YStack gap={2}>
        <Text fontSize={13} fontWeight="600" color="$neutral500" textTransform="uppercase">
          {title}
        </Text>
        {subtitle && (
          <Text fontSize={12} color="$neutral500">
            {subtitle}
          </Text>
        )}
      </YStack>
      {children}
    </YStack>
  );
}
