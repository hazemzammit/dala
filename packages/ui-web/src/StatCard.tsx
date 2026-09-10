/**
 * packages/ui-web/src/StatCard.tsx
 *
 * Extracted from apps/web/src/components/ui/StatCard.tsx and
 * apps/admin/src/components/ui/StatCard.tsx (Phase 19B, item 3) — the
 * two were byte-identical; no behavioral decision needed.
 *
 * Doc 05 §4 component inventory: "the single most-reused component
 * across both apps." Hero number + label + delta chip + optional
 * sparkline. States: default, loading (skeleton), empty.
 *
 * Mobile has its own separate Tamagui implementation with identical
 * props/behavior (apps/mobile/src/components/ui/StatCard.tsx) — Doc 05
 * §1.7o is explicit that mobile is never part of this package (React
 * Native and DOM aren't usefully abstracted behind one shared component
 * API) — keep the two in sync by hand when changing either one.
 */
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: { value: string; direction: 'up' | 'down' | 'neutral' };
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
}

export function StatCard({ label, value, delta, loading, empty, emptyMessage }: StatCardProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
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
    <Card className="p-6">
      <p className="text-[13px] font-semibold uppercase tracking-[0.04em] text-neutral-500">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-[36px] font-semibold tabular-nums leading-[1.15] text-neutral-900">
          {value}
        </span>
        {delta && (
          <span
            className={
              delta.direction === 'up'
                ? 'text-success text-sm font-medium'
                : delta.direction === 'down'
                  ? 'text-danger text-sm font-medium'
                  : 'text-sm font-medium text-neutral-500'
            }
          >
            {delta.value}
          </span>
        )}
      </div>
    </Card>
  );
}
