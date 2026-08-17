import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Text, View, XStack, YStack } from 'tamagui';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Chart.tsx
 *
 * Full-size chart trio — `BarChart`, `LineChart`, `DonutChart` — the gap
 * left by `Sparkline.tsx` (Phase 24), which was deliberately built tiny and
 * axis-less for the StatCard corner use case. This file is for the
 * opposite case: a chart that IS the content of a section (Dashboard's
 * weekly payroll trend, Expenses' category breakdown), with axis labels
 * and a legend.
 *
 * Same reasoning as Sparkline's own header comment: built directly on
 * `react-native-svg` (already a dependency) rather than pulling in
 * victory-native/react-native-svg-charts — this app's real data shapes
 * (a handful of weekly buckets, 3-5 expense categories) don't need
 * pan/zoom/tooltip machinery, and hand-rolling keeps every chart exactly
 * on-token instead of fighting a third-party theme layer.
 *
 * Dark-mode pass: every `tintColor`/track/fill default here used to read
 * `color.accent[600]`/`color.neutral[...]` directly — moved to
 * `useTokenColor()`, resolved inside each component's body (a default
 * PARAMETER value can't call a hook, so `tintColor?: string` with no
 * default plus a `?? tc.accent600` fallback inside the function is the
 * pattern used throughout this file, same as `Sparkline.tsx`).
 */

// ---------------------------------------------------------------------------
// BarChart — Doc 05 §2.2 "bars for money": weekly payroll, per-worker totals.
// ---------------------------------------------------------------------------
interface BarChartPoint {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartPoint[];
  height?: number;
  tintColor?: string;
  /** Highlights the last bar (current period) at full opacity, same
   * "is-last" emphasis Sparkline already uses. */
  emphasizeLast?: boolean;
  valueFormatter?: (value: number) => string;
}

export function BarChart({
  data,
  height = 140,
  tintColor,
  emphasizeLast = true,
  valueFormatter = (v) => v.toFixed(0),
}: BarChartProps) {
  const tc = useTokenColor();
  const resolvedTint = tintColor ?? tc.accent600;
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const chartHeight = height - 36; // reserve space for axis labels

  return (
    <YStack width="100%">
      <XStack width="100%" height={chartHeight} alignItems="flex-end" gap="$1">
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          const barHeight = Math.max((d.value / max) * chartHeight, 3);
          return (
            <YStack key={`${d.label}-${i}`} flex={1} alignItems="center" gap={6}>
              <Text fontSize={10.5} color="$neutral500" fontWeight="600" numberOfLines={1}>
                {d.value > 0 ? valueFormatter(d.value) : ''}
              </Text>
              <View
                width="72%"
                height={barHeight}
                borderRadius={7}
                backgroundColor={resolvedTint}
                opacity={emphasizeLast && !isLast ? 0.32 : 1}
              />
            </YStack>
          );
        })}
      </XStack>
      <XStack width="100%" marginTop="$2">
        {data.map((d, i) => (
          <Text
            key={`label-${i}`}
            flex={1}
            fontSize={11}
            color="$neutral500"
            textAlign="center"
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </XStack>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// LineChart — Doc 05 §2.2 "lines for progress/time metrics": budget-consumed
// trend, attendance-rate trend.
// ---------------------------------------------------------------------------
interface LineChartProps {
  data: BarChartPoint[];
  height?: number;
  tintColor?: string;
  showDots?: boolean;
  showArea?: boolean;
}

export function LineChart({
  data,
  height = 140,
  tintColor,
  showDots = true,
  showArea = true,
}: LineChartProps) {
  const tc = useTokenColor();
  const resolvedTint = tintColor ?? tc.accent600;
  if (data.length < 2) return null;
  const chartHeight = height - 28;
  const width = 300; // viewBox is scaled to container by Svg's own width="100%"
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const padTop = 8;

  const points = data.map((d, i) => ({
    x: i * stepX,
    y: padTop + (chartHeight - padTop) * (1 - (d.value - min) / range),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1]!.x} ${chartHeight} L ${points[0]!.x} ${chartHeight} Z`;

  return (
    <YStack width="100%">
      <Svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`}>
        {showArea && <Path d={areaPath} fill={resolvedTint} opacity={0.08} />}
        <Path
          d={linePath}
          stroke={resolvedTint}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDots &&
          points.map((p, i) => (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === points.length - 1 ? 4.5 : 3}
              fill={i === points.length - 1 ? resolvedTint : tc.neutral0}
              stroke={resolvedTint}
              strokeWidth={2}
            />
          ))}
      </Svg>
      <XStack width="100%" marginTop="$2">
        {data.map((d, i) => (
          <Text
            key={i}
            flex={1}
            fontSize={11}
            color="$neutral500"
            textAlign="center"
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </XStack>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// DonutChart — multi-segment radial breakdown (expense categories, budget
// split). Distinct from Progress.tsx's `ProgressRing`, which is a
// single-value ring (percent complete) — this renders N segments with a
// legend, e.g. "Matériaux 45% / Sous-traitance 30% / ...".
// ---------------------------------------------------------------------------
export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  /** Rendered in the ring's center — typically a total value. */
  centerLabel?: string;
  centerValue?: string;
  showLegend?: boolean;
}

export function DonutChart({
  segments,
  size = 128,
  strokeWidth = 16,
  centerLabel,
  centerValue,
  showLegend = true,
}: DonutChartProps) {
  const tc = useTokenColor();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = total > 0 ? s.value / total : 0;
      const dash = fraction * circumference;
      const offset = circumference * (1 - cumulative);
      cumulative += fraction;
      return { ...s, dash, offset, fraction };
    });

  return (
    <XStack alignItems="center" gap="$4" flexWrap="wrap">
      <View width={size} height={size} alignItems="center" justifyContent="center">
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tc.neutral100}
            strokeWidth={strokeWidth}
            fill="none"
          />
          {arcs.map((arc, i) => (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={arc.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${arc.dash} ${circumference}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="butt"
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          ))}
        </Svg>
        {(centerLabel || centerValue) && (
          <YStack alignItems="center">
            {centerValue && (
              <Text fontFamily="$display" fontSize={size * 0.15} fontWeight="600">
                {centerValue}
              </Text>
            )}
            {centerLabel && (
              <Text fontSize={size * 0.08} color="$neutral500">
                {centerLabel}
              </Text>
            )}
          </YStack>
        )}
      </View>

      {showLegend && (
        <YStack gap="$2" flex={1} minWidth={120}>
          {segments.map((s, i) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
            return (
              <XStack key={i} alignItems="center" gap="$2" justifyContent="space-between">
                <XStack alignItems="center" gap="$2" flex={1}>
                  <View width={9} height={9} borderRadius={999} backgroundColor={s.color} />
                  <Text fontSize={13} color="$neutral900" numberOfLines={1} flex={1}>
                    {s.label}
                  </Text>
                </XStack>
                <Text fontSize={13} fontWeight="600" color="$neutral500">
                  {pct}%
                </Text>
              </XStack>
            );
          })}
        </YStack>
      )}
    </XStack>
  );
}

// Re-exported so screens needing a raw <Line>/<Rect>/<SvgText> for a custom
// one-off chart don't need a second react-native-svg import line — kept
// minimal, only what's actually used elsewhere in the app so far.
export { Line, Rect, SvgText };
