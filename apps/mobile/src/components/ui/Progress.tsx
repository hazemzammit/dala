import { color } from '@dala/design-tokens';
import Svg, { Circle } from 'react-native-svg';
import { View } from 'tamagui';

/**
 * apps/mobile/src/components/ui/Progress.tsx
 *
 * Phase 24 — closes a gap confirmed during the Phase 23/24 UI audit: zero
 * progress indicators existed anywhere in the mobile app, despite Doc 05
 * §3.3 explicitly specifying "a slim progress bar rendered inline in its
 * own column" (web) / "progress bar" per project card (Doc 05 §2.2 for the
 * mobile Active Projects card). Color thresholds follow Doc 05 §3.3's own
 * budget-consumed rule: green under 80%, amber 80–100%, red over 100% —
 * reused here for both bar and ring so "percent complete" and "budget
 * consumed" read consistently wherever this shows up.
 *
 * Built on react-native-svg (already a dependency) — no new native module.
 */
function thresholdColor(percent: number): string {
  if (percent > 100) return color.status.danger;
  if (percent >= 80) return color.status.warning;
  return color.status.success;
}

interface ProgressBarProps {
  /** 0–100+. Values above 100 render as a full red bar (over-budget). */
  value: number;
  height?: number;
  /** Overrides the automatic green/amber/red threshold color. */
  tintColor?: string;
  trackColor?: string;
}

export function ProgressBar({
  value,
  height = 6,
  tintColor,
  trackColor = color.neutral[100],
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(value, 100));
  const fillColor = tintColor ?? thresholdColor(value);

  return (
    <View
      width="100%"
      height={height}
      borderRadius={height / 2}
      backgroundColor={trackColor}
      overflow="hidden"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <View
        width={`${clamped}%`}
        height={height}
        borderRadius={height / 2}
        backgroundColor={fillColor}
      />
    </View>
  );
}

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  tintColor?: string;
  trackColor?: string;
  /** Rendered in the ring's center — typically a NumericText percent. */
  children?: React.ReactNode;
}

export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 6,
  tintColor,
  trackColor = color.neutral[100],
  children,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(value, 100));
  const fillColor = tintColor ?? thresholdColor(value);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <View
      width={size}
      height={size}
      alignItems="center"
      justifyContent="center"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          // SVG circles start at 3 o'clock; rotate so progress starts at 12.
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {children}
    </View>
  );
}
