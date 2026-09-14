'use client';

import type { TableDensity } from './DataTable';

// §6.4's three levels, labels verbatim from the guide.
const DENSITY_OPTIONS: { value: TableDensity; label: string }[] = [
  { value: 'confortable', label: 'Confortable' },
  { value: 'defaut', label: 'Défaut' },
  { value: 'compact', label: 'Compact' },
];

interface DensityToggleProps {
  value: TableDensity;
  onChange: (density: TableDensity) => void;
}

/**
 * packages/ui-web/src/DensityToggle.tsx — Phase 5.5 (§6.4): the
 * Confortable / Défaut / Compact segmented control for FilterBar's
 * trailing slot. Mirrors ViewToggle's pill pattern (aria-pressed
 * segments inside a bordered group). Additive export; nothing existing
 * changes.
 */
export function DensityToggle({ value, onChange }: DensityToggleProps) {
  return (
    <div
      role="group"
      aria-label="Densité"
      className="rounded-control bg-neutral-0 inline-flex items-center border border-neutral-200 p-0.5"
    >
      {DENSITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-[10px] px-2 py-1 text-xs font-medium transition-colors duration-150 ${
            value === option.value
              ? 'bg-accent-50 text-accent-700'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
