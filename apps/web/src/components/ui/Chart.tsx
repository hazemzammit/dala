'use client';

/**
 * apps/web/src/components/ui/Chart.tsx
 *
 * Gap-closure guide §1.10 (analytics) needs a BarChart and LineChart that
 * support variable-length data, per-bar color overrides (budget-consumed
 * and reliability/utilization thresholds), and value labels — web's only
 * existing chart primitive, `MiniBarChart` in `contractor/Screen.tsx`, is
 * fixed at exactly 7 columns with one flat tone for the whole chart, so it
 * can't serve this screen's up-to-10-bar project lists or per-bar
 * thresholds.
 *
 * Hand-rolled on plain SVG/divs rather than a charting library, same
 * reasoning mobile's own Chart.tsx header gives for building on
 * react-native-svg directly: these data shapes (a handful of weekly
 * buckets, up to ~10 project/worker/vehicle bars) don't need pan/zoom/
 * tooltip machinery, and this keeps every chart exactly on this app's
 * existing design tokens instead of fighting a third-party theme layer.
 * No new dependency added.
 */
export interface ChartPoint {
  label: string;
  value: number;
  /** Per-bar color override — takes precedence over `tintColor` for this
   * bar. Used by charts backed by a %-metric with an established
   * threshold (budget consumed, worker reliability, vehicle utilization)
   * where each bar needs to be colored by what the data means, not one
   * flat color for the whole chart. */
  color?: string;
}

interface BarChartProps {
  data: ChartPoint[];
  height?: number;
  tintColor?: string;
  /** Highlights the last bar (current period) at full opacity, fading
   * earlier bars — ignored for any bar with its own `color` set. */
  emphasizeLast?: boolean;
  valueFormatter?: (value: number) => string;
}

const DEFAULT_TINT = '#0F9D8E'; // color.accent[600], design-tokens

export function BarChart({
  data,
  height = 160,
  tintColor = DEFAULT_TINT,
  emphasizeLast = true,
  valueFormatter = (v) => v.toFixed(0),
}: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  const chartHeight = height - 40;

  return (
    <div className="w-full">
      <div className="flex w-full items-end gap-1" style={{ height: chartHeight }}>
        {data.map((d, i) => {
          const isLast = i === data.length - 1;
          const barHeightPct = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
          return (
            <div key={`${d.label}-${i}`} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="truncate text-[10.5px] font-semibold text-neutral-500">
                {d.value > 0 ? valueFormatter(d.value) : ''}
              </span>
              <div className="flex h-full w-full items-end">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${barHeightPct}%`,
                    minHeight: d.value > 0 ? 3 : 0,
                    backgroundColor: d.color ?? tintColor,
                    opacity: d.color ? 1 : emphasizeLast && !isLast ? 0.32 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex w-full gap-1">
        {data.map((d, i) => (
          <span
            key={`label-${i}`}
            className="flex-1 truncate text-center text-[11px] text-neutral-500"
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface LineChartProps {
  data: ChartPoint[];
  height?: number;
  tintColor?: string;
  showDots?: boolean;
  showArea?: boolean;
}

export function LineChart({
  data,
  height = 160,
  tintColor = DEFAULT_TINT,
  showDots = true,
  showArea = true,
}: LineChartProps) {
  if (data.length < 2) return null;
  const chartHeight = height - 28;
  const width = 300;
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
  const lastPoint = points[points.length - 1]!;
  const firstPoint = points[0]!;
  const areaPath = `${linePath} L ${lastPoint.x} ${chartHeight} L ${firstPoint.x} ${chartHeight} Z`;

  return (
    <div className="w-full">
      <svg width="100%" height={chartHeight} viewBox={`0 0 ${width} ${chartHeight}`}>
        {showArea && <path d={areaPath} fill={tintColor} opacity={0.08} />}
        <path
          d={linePath}
          stroke={tintColor}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showDots &&
          points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === points.length - 1 ? 4.5 : 3}
              fill={i === points.length - 1 ? tintColor : '#ffffff'}
              stroke={tintColor}
              strokeWidth={2}
            />
          ))}
      </svg>
      <div className="mt-2 flex w-full gap-1">
        {data.map((d, i) => (
          <span key={i} className="flex-1 truncate text-center text-[11px] text-neutral-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
