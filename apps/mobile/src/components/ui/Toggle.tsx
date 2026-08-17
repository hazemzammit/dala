import { Pressable } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Toggle.tsx
 *
 * Phase 25 — replaces React Native's raw `Switch` (still used directly in
 * notification-settings.tsx and collaboration.tsx, per the Phase 23/24 UI
 * audit's own component-gap table) with a themed equivalent — same accent
 * teal as every other interactive control in the app, instead of the
 * platform-default green/blue switch color that clashes with it. Built on
 * react-native-reanimated (already a dependency) rather than RN's own
 * `Animated`, matching the rest of the app's animation primitives.
 *
 * Dark-mode pass: track/thumb colors now come from `useTokenColor()`
 * instead of `color.neutral[...]`/`color.accent[600]` read directly.
 * `interpolateColor` runs inside `useAnimatedStyle`'s worklet, but the two
 * endpoint colors it interpolates between are plain JS values captured in
 * the closure — Reanimated re-captures them on every render the hook
 * re-runs, same as any other JS variable referenced inside a worklet, so
 * this needs no special handling beyond calling the hook at the top of the
 * component like everywhere else in this pass.
 */
interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 26;
const THUMB_SIZE = 22;
const THUMB_MARGIN = 2;

export function Toggle({ value, onChange, disabled, accessibilityLabel }: ToggleProps) {
  const tc = useTokenColor();
  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, { duration: 160 }), [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [tc.neutral300, tc.accent600]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * (TRACK_WIDTH - THUMB_SIZE - THUMB_MARGIN * 2) }],
  }));

  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_HEIGHT / 2,
            padding: THUMB_MARGIN,
            justifyContent: 'center',
          },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: THUMB_SIZE / 2,
              backgroundColor: tc.neutral0,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
