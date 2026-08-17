import type { Icon } from 'phosphor-react-native';
import { styled, View } from 'tamagui';

/** Same spring press feedback as Button — the FAB previously had no press
 * state at all (no pressStyle, no scale), which reads as unresponsive
 * given how prominent it is on-screen. */
const PressableFAB = styled(View, {
  animation: 'press',
  pressStyle: { scale: 0.92 },
});

/**
 * apps/mobile/src/components/shell/FAB.tsx
 *
 * Doc 05 §2.1 — "single circular filled accent-600 button, floating above
 * the bottom nav, contextual per screen... Never more than one FAB action
 * visible."
 *
 * Dark-mode pass: deliberately did NOT migrate this icon's color to
 * `useTokenColor()`. Every other icon-color fix in this pass swapped
 * `color.neutral[0]` for `tc.neutral0` because in those cases it meant
 * "the current theme's raised-surface color." Here it means something
 * different — a plain white icon glyph against the FAB's own solid
 * `$accent600` background, independent of the app's theme. `tc.neutral0`
 * INVERTS to near-black in dark mode (it's the dark "card surface" color),
 * so using it here would make the icon nearly invisible against the still-
 * teal FAB background — swapping this one would have been a regression
 * disguised as a consistency fix. Kept as a literal white on purpose.
 */
interface FABProps {
  icon: Icon;
  onPress: () => void;
  accessibilityLabel: string;
}

export function FAB({ icon: IconComponent, onPress, accessibilityLabel }: FABProps) {
  return (
    <PressableFAB
      position="absolute"
      bottom={96}
      right={20}
      width={56}
      height={56}
      borderRadius={28}
      backgroundColor="$accent600"
      alignItems="center"
      justifyContent="center"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      shadowColor="#000"
      shadowOpacity={0.15}
      shadowRadius={10}
      shadowOffset={{ width: 0, height: 4 }}
      // @ts-expect-error — `elevation` is RN's Android shadow prop; Tamagui's View
      // style types don't declare it, but it's still forwarded to the native View
      // at runtime, so this keeps the Android shadow rather than dropping it.
      elevation={4}
    >
      <IconComponent size={24} color="#FFFFFF" weight="bold" />
    </PressableFAB>
  );
}
