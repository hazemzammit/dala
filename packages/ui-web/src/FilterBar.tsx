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
 * Premium-polish pass (pre-Phase-5 cleanup): shadow strengthened to match
 * Card's updated `elevation.resting` value, and vertical padding bumped
 * (py-3 → py-3.5) — same "give it room to breathe" direction as the rest
 * of this pass.
 */

interface FilterBarProps {
  children: ReactNode;
  trailing?: ReactNode;
}

export function FilterBar({ children, trailing }: FilterBarProps) {
  return (
    <div className="rounded-card bg-neutral-0 flex flex-wrap items-center gap-3 border border-neutral-100 px-4 py-3.5 shadow-[0_1px_3px_rgba(17,19,24,0.06),0_6px_16px_rgba(17,19,24,0.05)]">
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
