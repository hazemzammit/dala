import { Text, XStack } from 'tamagui';

/**
 * apps/mobile/src/components/worker/WorkerHubTabs.tsx
 *
 * IMPROVEMENT-PLAN PHASE 6 (§1.6) — the worker-detail hub's tab switcher.
 *
 * JUDGMENT CALL, per the plan's own explicit instruction to check
 * `SegmentedControl` first and only build something new if the fit is
 * genuinely poor: this is a NEW small component, not a `SegmentedControl`
 * reuse. NOT a width problem — four short labels (Infos/Pointage/Avances/
 * Dispatch) fit comfortably at `flex={1}` on a phone-width screen, the
 * same visual chrome (`$neutral100` track, `$control` radius, `$neutral0`
 * active pill) is copied below for consistency. The mismatch is
 * semantic: `SegmentedControl<T>`'s `Option<T>` REQUIRES a `color` field
 * per option, because its one existing consumer (pointage.tsx's
 * Présent/Absent/Demi-journée toggle) is a STATE selector where each
 * option has a real meaning worth coloring (success/danger/warning). A
 * plain navigational tab bar has no such per-tab meaning — inventing an
 * arbitrary color per tab (there is no "Dispatch tab = orange" fact to
 * encode) would be decoration pretending to be signal, which this
 * codebase's own `StatusBadge`/`SegmentedControl` both otherwise reserve
 * for genuine state. Copying the chrome without misusing the color
 * semantics was judged better than either (a) inventing meaningless
 * per-tab colors to satisfy `Option<T>`'s shape, or (b) widening
 * `SegmentedControl` itself to make `color` optional for a shape its only
 * other caller still requires — out of scope for this phase to touch a
 * shared primitive over one new call site.
 */
export interface WorkerHubTab {
  value: string;
  label: string;
}

interface WorkerHubTabsProps {
  value: string;
  tabs: WorkerHubTab[];
  onChange: (value: string) => void;
}

export function WorkerHubTabs({ value, tabs, onChange }: WorkerHubTabsProps) {
  return (
    <XStack backgroundColor="$neutral100" borderRadius="$control" padding={2} gap={2}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <XStack
            key={tab.value}
            flex={1}
            paddingVertical={7}
            alignItems="center"
            justifyContent="center"
            borderRadius={10}
            backgroundColor={active ? '$neutral0' : 'transparent'}
            onPress={() => onChange(tab.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              fontSize={12.5}
              fontWeight={active ? '600' : '400'}
              color={active ? '$accent600' : '$neutral500'}
            >
              {tab.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}
