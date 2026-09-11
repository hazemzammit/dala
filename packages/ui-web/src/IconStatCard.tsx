import type { Icon } from '@phosphor-icons/react';

import { Card } from './Card';

/**
 * packages/ui-web/src/IconStatCard.tsx
 *
 * Admin UI/UX overhaul pass — new sibling of StatCard that adds a colored
 * icon chip (§2.3 of the plan). StatCard itself is untouched so no
 * existing apps/web or mobile-parity assumption is disturbed.
 *
 * The `tone` prop drives the icon chip's background (10% opacity of the
 * tone color) and the icon's solid fill color. `Card` is passed
 * `interactive` so the subtle hover lift applies automatically.
 *
 * Typography is intentionally identical to StatCard so the two can be
 * mixed in the same grid without visual inconsistency.
 */

type IconStatTone =
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'categoricalBlue'
  | 'categoricalViolet'
  | 'categoricalAmber'
  | 'neutral';

/**
 * Static class strings — written out in full so Tailwind's content
 * scanner detects them (no dynamic construction).
 */
const toneChipClasses: Record<IconStatTone, string> = {
  accent: 'bg-accent-50 text-accent-600',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  categoricalBlue: 'bg-[#3E6FD1]/10 text-[#3E6FD1]',
  categoricalViolet: 'bg-[#7B5FCE]/10 text-[#7B5FCE]',
  categoricalAmber: 'bg-[#B5790F]/10 text-[#B5790F]',
  neutral: 'bg-neutral-100 text-neutral-500',
};

interface IconStatCardProps {
  label: string;
  value: string | number;
  icon: Icon;
  tone?: IconStatTone;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
}

export function IconStatCard({
  label,
  value,
  icon: IconComponent,
  tone = 'accent',
  loading,
  empty,
  emptyMessage,
}: IconStatCardProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-10 w-10 animate-pulse rounded-xl bg-neutral-100" />
        <div className="mt-3 h-3 w-24 animate-pulse rounded bg-neutral-100" />
        <div className="mt-3 h-9 w-32 animate-pulse rounded bg-neutral-100" />
      </Card>
    );
  }

  if (empty) {
    return (
      <Card className="p-6">
        <p className="text-sm text-neutral-500">
          {emptyMessage ?? 'Aucune donnée pour le moment.'}
        </p>
      </Card>
    );
  }

  return (
    <Card interactive className="p-6">
      {/* Icon chip */}
      <div
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneChipClasses[tone]}`}
        aria-hidden="true"
      >
        <IconComponent size={20} weight="duotone" />
      </div>

      {/* Label */}
      <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-neutral-500">
        {label}
      </p>

      {/* Value */}
      <p className="font-display mt-1 text-[36px] font-semibold tabular-nums leading-[1.15] text-neutral-900">
        {value}
      </p>
    </Card>
  );
}
