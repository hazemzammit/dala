import { Card, StatusBadge } from '@dala/ui-web';
import type { ReactNode } from 'react';

interface SectionCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  className = '',
}: SectionCardProps) {
  return (
    <Card className={`p-6 ${className}`} raised>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-neutral-900">{title}</h2>
          {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  delta?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  footnote?: string;
}

export function MetricCard({ label, value, delta, tone = 'default', footnote }: MetricCardProps) {
  const toneClasses =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-neutral-500';

  return (
    <Card className="p-5" raised>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="font-display text-[30px] font-semibold tabular-nums leading-none text-neutral-900">
          {value}
        </div>
        {delta && <span className={`text-sm font-medium ${toneClasses}`}>{delta}</span>}
      </div>
      {footnote && <p className="mt-3 text-sm text-neutral-500">{footnote}</p>}
    </Card>
  );
}

/**
 * Doc 05 §1.7i — Status Metric variant: "a count that's really a state"
 * (e.g. how many vehicles are in each status). Inline `StatusBadge`,
 * deliberately NOT wrapped in `Card` — the anti-pattern this fixes is
 * exactly "identical label→number→white-card treatment" (§1.7i), so this
 * variant must not just be StatusBadge-inside-a-card, it must actually
 * look different (flat row, no shadow, no border-radius-card weight).
 */
interface StatusMetricProps {
  label: string;
  count: number;
  variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
}

export function StatusMetric({ label, count, variant }: StatusMetricProps) {
  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-3">
      <span className="text-sm text-neutral-500">{label}</span>
      <StatusBadge variant={variant}>{count}</StatusBadge>
    </div>
  );
}

/**
 * Doc 05 §1.7i (Financial Metric) + §1.7j (business meaning, not just
 * sign) — a currency value where color is supplementary, never the only
 * signal, and the label itself communicates the business situation. This
 * does NOT implement a blanket sign-to-color rule; `tone` is something
 * the caller decides per §1.7j's business-situation table (e.g. a
 * profit/loss period result changes to "Perte" — a different LABEL, not
 * just a different color — see reports/page.tsx for that decision).
 */
interface FinancialMetricProps {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

export function FinancialMetric({ label, value, tone = 'neutral' }: FinancialMetricProps) {
  // Doc 05 §1.7j: `financial-positive`/`financial-negative` (packages/
  // design-tokens) are pure aliases onto `status.success`/`status.danger`
  // — same color values, so reusing the already-Tailwind-wired
  // `text-success`/`text-danger` utilities here is equivalent, without
  // needing a separate `financial-*` entry in the shared Tailwind preset
  // for what would be an identical color.
  const toneClasses =
    tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-danger' : 'text-neutral-900';

  return (
    <Card className="p-5" raised>
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {label}
      </p>
      <p
        className={`font-display mt-2 text-[26px] font-semibold tabular-nums leading-none ${toneClasses}`}
      >
        {value}
      </p>
    </Card>
  );
}

interface ProgressBarProps {
  value: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}

export function ProgressBar({ value, tone = 'accent' }: ProgressBarProps) {
  const toneClass =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-accent-600';

  return (
    <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
      <div
        className={`h-full rounded-full ${toneClass}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

interface MiniBarChartProps {
  values: number[];
  labels: string[];
  tone?: 'accent' | 'success';
}

export function MiniBarChart({ values, labels, tone = 'accent' }: MiniBarChartProps) {
  const toneClass = tone === 'success' ? 'bg-success' : 'bg-accent-600';

  return (
    <div className="grid grid-cols-7 gap-2">
      {values.map((value, index) => (
        <div
          key={labels[index] ?? index}
          className="flex min-h-[140px] flex-col items-center justify-end gap-2"
        >
          <div className="bg-neutral-25 flex h-full w-full items-end rounded-2xl px-1.5 pb-1.5 pt-2">
            <div
              className={`w-full rounded-xl ${toneClass} shadow-[0_8px_14px_rgba(15,118,110,0.16)]`}
              style={{ height: `${Math.max(18, Math.min(100, value))}%` }}
            />
          </div>
          <span className="text-[11px] font-medium text-neutral-500">{labels[index]}</span>
        </div>
      ))}
    </div>
  );
}

interface TimelineItem {
  title: string;
  description: string;
  time: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
}

export function TimelineList({ items }: { items: TimelineItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item) => {
        const toneClass =
          item.tone === 'success'
            ? 'bg-success'
            : item.tone === 'warning'
              ? 'bg-warning'
              : item.tone === 'danger'
                ? 'bg-danger'
                : 'bg-accent-600';

        return (
          <div key={`${item.title}-${item.time}`} className="flex gap-4">
            <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-neutral-900">{item.title}</h3>
                <span className="text-xs text-neutral-500">{item.time}</span>
              </div>
              <p className="mt-1 text-sm leading-6 text-neutral-500">{item.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface CalendarGridProps {
  days: Array<{ day: string; label: string; tone?: 'accent' | 'success' | 'warning' }>;
  selectedDay?: string | null;
  onDayClick?: (day: string) => void;
}

export function CalendarGrid({ days, selectedDay, onDayClick }: CalendarGridProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const toneClass =
          day.tone === 'success'
            ? 'border-success/30 bg-success/10 text-success'
            : day.tone === 'warning'
              ? 'border-warning/30 bg-warning/10 text-warning'
              : 'border-accent-200 bg-accent-50 text-accent-700';
        const isSelected = selectedDay === day.day;

        return (
          <button
            key={`${day.day}-${day.label}`}
            type="button"
            onClick={() => onDayClick?.(day.day)}
            className={`hover:border-accent-300 flex min-h-[92px] flex-col justify-between rounded-2xl border p-3 text-left transition-colors ${toneClass} ${
              isSelected ? 'ring-accent-600 ring-2 ring-offset-2' : ''
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.08em] opacity-70">
              {day.day}
            </span>
            <span className="text-sm font-medium leading-5">{day.label}</span>
          </button>
        );
      })}
    </div>
  );
}
