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
 */

interface ViewToggleProps {
  value: 'table' | 'card';
  onChange: (v: 'table' | 'card') => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label="Mode d'affichage"
      className="rounded-control bg-neutral-0 inline-flex border border-neutral-300"
    >
      <button
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={value === 'table'}
        aria-label="Vue tableau"
        title="Vue tableau"
        className={[
          'rounded-s-control inline-flex h-8 w-8 items-center justify-center transition-colors',
          value === 'table'
            ? 'bg-accent-50 text-accent-700'
            : 'text-neutral-500 hover:bg-neutral-100',
        ].join(' ')}
      >
        <TableIcon size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onChange('card')}
        aria-pressed={value === 'card'}
        aria-label="Vue carte"
        title="Vue carte"
        className={[
          'rounded-e-control inline-flex h-8 w-8 items-center justify-center transition-colors',
          value === 'card'
            ? 'bg-accent-50 text-accent-700'
            : 'text-neutral-500 hover:bg-neutral-100',
        ].join(' ')}
      >
        <SquaresFourIcon size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
