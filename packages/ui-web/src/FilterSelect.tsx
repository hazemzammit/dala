'use client';

import type { SelectHTMLAttributes } from 'react';

/**
 * packages/ui-web/src/FilterSelect.tsx
 *
 * Phase 4.7 (§2.1) — thin wrapper around a native <select> so every
 * direct child of FilterBar is one control height, instead of the height
 * class being fixed independently in three page files. One place to keep
 * this in sync going forward, per §2.1's own rationale.
 *
 * Control classes mirror SearchInput's input exactly (checked against
 * apps/admin/src/components/ui/SearchInput.tsx before writing): the
 * §2.1 [DECISION] set — h-10, rounded-control, border-neutral-300,
 * focus:border-accent-600, bg-neutral-0 — with SearchInput's
 * icon-positioning padding (pl-9) omitted (a select has no leading
 * icon) and §2.1's explicit h-10 replacing SearchInput's current
 * padding-derived height (the same swap §2.1 schedules for SearchInput
 * itself — that file is admin-local and NOT touched in this step).
 *
 * Pure addition in this step — wired into NO page yet (Steps 6/7 adopt
 * it).
 */

const CONTROL_CLASSES =
  'h-10 rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-3 text-[15.5px] text-neutral-900 outline-none transition-colors duration-150';

interface FilterSelectOption {
  value: string;
  label: string;
}

type FilterSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  options: FilterSelectOption[];
};

export function FilterSelect({ options, className = '', ...rest }: FilterSelectProps) {
  return (
    <select className={`${CONTROL_CLASSES} ${className}`} {...rest}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
