import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { NumericText } from './NumericText';

/**
 * apps/mobile/src/components/ui/CriticalMetricHero.tsx
 *
 * Doc 05 §1.7g / §4 — Phase 20. Extracted from `advances.tsx`'s existing
 * "Net restant à payer cette semaine" block — the only screen in the
 * current codebase with the actual dark, high-contrast surface this
 * component describes.
 *
 * NOTE (Phase 20 discrepancy, logged in docs/audits/phase-20-migration-log.md):
 * the original visual audit's screenshot suggested Dashboard also used this
 * black-hero treatment. Direct source inspection of `dashboard.tsx` found
 * it currently renders its "Net à payer cette semaine" number through
 * `StatCard` (a white `$neutral0` card with a sparkline) instead — built in
 * a later pass, per that screen's own header comment. This component is
 * extracted from Advances' real implementation only. Dashboard's `StatCard`
 * is left untouched, per the resolved decision that it's a legitimate KPI
 * Metric variant (§1.7i), not a violation to fix as a side effect of this
 * extraction. Do not add `CriticalMetricHero` to Dashboard, or any other
 * screen, without a new evidenced case for it — §1.7g's "at most one per
 * screen" and "the single most consequential financial total" limits still
 * apply, and this phase has no authority to decide Dashboard should change.
 *
 * Mobile-only, by decision (§1.7f) — never introduce a web/admin
 * equivalent for visual parity; both platforms have their own correct
 * pattern already (Page Hero + Metric Display System on web, §1.7h/§1.7i).
 *
 * Contract: Sora numeral at the largest scale on the screen, one supporting
 * sparkline-or-ring (never more than one), never a second hero on the same
 * screen.
 */
interface CriticalMetricHeroProps {
  /** Small muted label above the number, e.g. "Net restant à payer cette semaine". */
  label: string;
  /** The hero number itself — already formatted, e.g. "1 240". */
  value: string;
  unit?: string;
  /**
   * The one supporting element — a sparkline or a progress ring, per
   * §1.7g's "never more than one" rule. Pass at most one of
   * `supporting`/using this slot; the component doesn't enforce that at
   * the type level since ProgressRing/Sparkline live in separate files,
   * but callers should treat this as a single-slot contract.
   */
  supporting?: ReactNode;
}

export function CriticalMetricHero({ label, value, unit, supporting }: CriticalMetricHeroProps) {
  return (
    <XStack
      backgroundColor="$neutral900"
      borderRadius="$card"
      padding="$4"
      marginBottom="$4"
      alignItems="center"
      justifyContent="space-between"
    >
      <YStack>
        <Text color="$neutral0" fontSize={13} opacity={0.75}>
          {label}
        </Text>
        <NumericText color="$neutral0" fontFamily="$display" fontSize={34} fontWeight="600">
          {value}
          {unit ? ` ${unit}` : ''}
        </NumericText>
      </YStack>

      {supporting}
    </XStack>
  );
}
