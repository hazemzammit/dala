/**
 * packages/ui-web/src/Skeleton.tsx
 *
 * Admin UI/UX overhaul pass — generalizes the animated-pulse skeleton
 * pattern already used inside StatCard's loading state into two reusable
 * primitives (§2.15 of the plan):
 *
 *   Skeleton      — a single pulsing bar, sized by className.
 *   TableSkeleton — a Card containing a grid of bars shaped like a table.
 *
 * Used to replace `{loading ? <p>Chargement…</p> : ...}` branches across
 * admin pages. No test asserts on the "Chargement…" string (confirmed
 * by grepping apps/admin/tests/ — zero matches), so this is a safe swap.
 */

import { Card } from './Card';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return <div className={`animate-pulse rounded bg-neutral-100 ${className}`} aria-hidden="true" />;
}

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <Card className="overflow-hidden p-0" aria-busy="true" aria-label="Chargement…">
      {/* Header row */}
      <div className="flex gap-4 border-b border-neutral-100 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 rounded" />
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 border-b border-neutral-100 px-4 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, ci) => (
            <Skeleton key={ci} className={`h-4 flex-1 rounded ${ci === 0 ? 'max-w-[40%]' : ''}`} />
          ))}
        </div>
      ))}
    </Card>
  );
}
