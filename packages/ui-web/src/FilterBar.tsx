'use client';

import type { ReactNode } from 'react';

/**
 * packages/ui-web/src/FilterBar.tsx
 *
 * Admin UI/UX overhaul pass — card-styled row that holds a search slot,
 * arbitrary filter controls, and a trailing slot (e.g. ViewToggle).
 * §2.5 of the plan.
 *
 * Intentionally a thin layout wrapper: it imposes no opinions about
 * what the filter controls are — callers compose their own SearchInput,
 * <select>, toggle chips, etc. as children.
 *
 * `trailing` — optional slot flush to the right edge (ViewToggle lives here).
 *
 * Premium-polish pass (pre-Phase-5 cleanup): vertical padding bumped
 * (py-3 → py-3.5) — same "give it room to breathe" direction as the rest
 * of this pass. (That pass also added a resting shadow; removed again by
 * Phase 4.6 below.)
 *
 * Phase 4.6 (premium-ux-system-guide.md §2 — hierarchy): FilterBar is a
 * Level-1 surface — border only, no shadow. The one raised (Level-2)
 * surface on a list screen is the DataTable card; the filter row is a
 * container around controls, not a hero element. Padding, radius, border
 * and background are unchanged.
 */

interface FilterBarProps {
  children: ReactNode;
  trailing?: ReactNode;
}

export function FilterBar({ children, trailing }: FilterBarProps) {
  return (
    <div className="rounded-card bg-neutral-0 flex flex-wrap items-center gap-3 border border-neutral-100 px-4 py-3.5">
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
