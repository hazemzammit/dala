'use client';

import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';

/**
 * packages/ui-web/src/Pagination.tsx
 *
 * Admin UI/UX overhaul pass â€” extracted from DataTable.tsx's inline
 * pagination markup so it can be used standalone (Â§2.9 of the plan).
 *
 * Prop shape is identical to DataTablePagination so DataTable can drop
 * this in with zero prop-contract change for its callers.
 *
 * Test-contract invariants (Â§0.4 â€” must survive unchanged):
 *   - "Page X/Y" text format   â†’ getByText(/Page \d+\/\d+/)
 *   - "Suivant" button label   â†’ getByRole('button', { name: 'Suivant' })
 *   - "PrÃ©cÃ©dent" button label â†’ getByRole('button', { name: 'PrÃ©cÃ©dent' })
 *   - "Xâ€“Y sur Z" / "0 rÃ©sultat" count text
 *
 * The prev/next buttons use icon-only visuals but keep the text as
 * sr-only + aria-label so all four assertions above keep resolving.
 *
 * Premium-polish pass (pre-Phase-5 cleanup): previously this was just
 * text + two bare bordered squares floating on the page background â€” no
 * containing surface at all, so it read as unstyled scaffolding rather
 * than a real control. Now the whole thing sits in one pill-shaped bar
 * (same border/shadow language as IconActionButton/ViewToggle), with the
 * page indicator promoted to the visual center of that bar.
 */

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrev = page > 1;
  const hasNext = page * pageSize < total;

  const rangeText =
    total === 0
      ? '0 résultat'
      : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} sur ${total}`;

  const navButtonClasses =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 motion-safe:transition-all motion-safe:duration-150 hover:-translate-y-0 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-accent-600 hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-neutral-200 disabled:hover:bg-transparent disabled:hover:text-neutral-600';

  return (
    <div className="bg-neutral-0 mt-4 flex items-center justify-between gap-3 rounded-full border border-neutral-200 px-3 py-2 shadow-[0_1px_2px_rgba(17,19,24,0.05)]">
      <span className="pl-2 text-sm text-neutral-500">{rangeText}</span>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="PrÃ©cÃ©dent"
          title="PrÃ©cÃ©dent"
          className={navButtonClasses}
        >
          <ArrowLeftIcon size={14} aria-hidden="true" />
          <span className="sr-only">PrÃ©cÃ©dent</span>
        </button>

        <span className="min-w-[68px] text-center text-xs font-medium text-neutral-900">
          Page {page}/{totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Suivant"
          title="Suivant"
          className={navButtonClasses}
        >
          <ArrowRightIcon size={14} aria-hidden="true" />
          <span className="sr-only">Suivant</span>
        </button>
      </div>
    </div>
  );
}
