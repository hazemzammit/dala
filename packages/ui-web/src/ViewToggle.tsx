'use client';

import { SquaresFourIcon, TableIcon } from '@phosphor-icons/react';

/**
 * packages/ui-web/src/ViewToggle.tsx
 *
 * Admin UI/UX overhaul pass — two-button segmented control for switching
 * between table and card list views. §2.6 of the plan.
 *
 * Test-contract / default-state rules (§0.5):
 *   - The parent MUST always initialize `value` to 'table' on a fresh load.
 *   - This component is purely controlled; it never manages its own default.
 *     The caller (e.g. OrganizationsTable) is responsible for the default.
 *
 * Premium-polish pass (pre-Phase-5 cleanup) — rebuilt as an iOS/macOS-style
 * segmented control: a neutral-100 "track" holding a floating white pill
 * that carries the active option (bg-neutral-0 + small shadow), rather
 * than the previous flat two-button pair with no resting surface at all
 * (which is why it read as unstyled). Same accessible-name/aria-pressed
 * contract as before — nothing test-relevant changed.
 */

interface ViewToggleProps {
  value: 'table' | 'card';
  onChange: (v: 'table' | 'card') => void;
}

const OPTIONS = [
  { value: 'table' as const, label: 'Vue tableau', icon: TableIcon },
  { value: 'card' as const, label: 'Vue carte', icon: SquaresFourIcon },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Mode d'affichage"
      className="inline-flex items-center gap-0.5 rounded-full bg-neutral-100 p-1"
    >
      {OPTIONS.map(({ value: v, label, icon: IconComponent }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150',
              active
                ? 'bg-neutral-0 text-accent-700 shadow-[0_1px_3px_rgba(17,19,24,0.12)]'
                : 'text-neutral-500 hover:text-neutral-900',
            ].join(' ')}
          >
            <IconComponent size={16} weight={active ? 'bold' : 'regular'} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
