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
 */

interface FilterBarProps {
  children: ReactNode;
  trailing?: ReactNode;
}

export function FilterBar({ children, trailing }: FilterBarProps) {
  return (
    <div className="rounded-card bg-neutral-0 flex flex-wrap items-center gap-3 border border-neutral-100 px-4 py-3 shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]">
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
