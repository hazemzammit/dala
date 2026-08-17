import Svg, { Line, Path, Rect } from 'react-native-svg';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Sparkline.tsx
 *
 * Phase 24 — Doc 05 §2.2's "thin sparkline beneath" the hero card, and
 * §2.2's own guidance: "pick bars for money, lines for progress/time
 * metrics." No chart library existed anywhere in the app before this —
 * built directly on react-native-svg (already a dependency, no new native
 * module) rather than pulling in victory-native or similar for what is,
 * for this app's actual data shapes, a small fixed set of points with no
 * need for pan/zoom/tooltips.
 *
 * Dark-mode pass: the `color` prop's default used to be a light-only
 * `color.accent[600]` literal baked into the parameter list — moved to
 * `useTokenColor()`, resolved inside the function body, same reasoning as
 * `Progress.tsx`'s `trackColor` fix.
 */
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function SparklineBars({ data, width = 120, height = 32, color }: SparklineProps) {
  const tc = useTokenColor();
  const tint = color ?? tc.accent600;
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const gap = 3;
  const barWidth = (width - gap * (data.length - 1)) / data.length;

  return (
    <Svg width={width} height={height}>
      {data.map((v, i) => {
        const barHeight = Math.max((v / max) * height, 2);
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const isLast = i === data.length - 1;
        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={2}
            fill={tint}
            opacity={isLast ? 1 : 0.35}
          />
        );
      })}
    </Svg>
  );
}

export function SparklineLine({ data, width = 120, height = 32, color }: SparklineProps) {
  const tc = useTokenColor();
  const tint = color ?? tc.accent600;
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return { x, y };
  });

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const last = points[points.length - 1]!;

  return (
    <Svg width={width} height={height}>
      <Path
        d={path}
        stroke={tint}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1={last.x} y1={last.y - 3} x2={last.x} y2={last.y + 3} stroke={tint} strokeWidth={0} />
      <Path d={`M ${last.x} ${last.y} m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`} fill={tint} />
    </Svg>
  );
}
