/**
 * apps/admin/src/components/ui/StatCard.tsx — mirrors apps/web's exactly.
 * Doc 05 §4: "the single most-reused component across both apps." Used
 * sparingly on the admin Dashboard only (Doc 05 §3.6 — no marketing-
 * adjacent hero cards elsewhere; a plain metric number isn't that).
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
