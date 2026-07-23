import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-[24px] border border-neutral-100 bg-[linear-gradient(180deg,rgba(15,118,110,0.05),rgba(255,255,255,0.92))] p-6 shadow-[0_8px_24px_rgba(17,19,24,0.04)] lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="text-accent-700 text-[12px] font-semibold uppercase tracking-[0.12em]">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display mt-2 text-[28px] font-semibold leading-[1.1] text-neutral-900 lg:text-[34px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 lg:text-[15.5px]">
          {description}
        </p>
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

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
}

export function CalendarGrid({ days }: CalendarGridProps) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const toneClass =
          day.tone === 'success'
            ? 'border-success/30 bg-success/10 text-success'
            : day.tone === 'warning'
              ? 'border-warning/30 bg-warning/10 text-warning'
              : 'border-accent-200 bg-accent-50 text-accent-700';

        return (
          <button
            key={`${day.day}-${day.label}`}
            className={`hover:border-accent-300 flex min-h-[92px] flex-col justify-between rounded-2xl border p-3 text-left transition-colors ${toneClass}`}
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
