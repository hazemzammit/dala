'use client';

import { ArrowLeftIcon, ArrowRightIcon } from '@phosphor-icons/react';

/**
 * packages/ui-web/src/Pagination.tsx
 *
 * Admin UI/UX overhaul pass — extracted from DataTable.tsx's inline
 * pagination markup so it can be used standalone (§2.9 of the plan).
 *
 * Prop shape is identical to DataTablePagination so DataTable can drop
 * this in with zero prop-contract change for its callers.
 *
 * Test-contract invariants (§0.4 — must survive unchanged):
 *   - "Page X/Y" text format   → getByText(/Page \d+\/\d+/)
 *   - "Suivant" button label   → getByRole('button', { name: 'Suivant' })
 *   - "Précédent" button label → getByRole('button', { name: 'Précédent' })
 *   - "X–Y sur Z" / "0 résultat" count text
 *
 * The prev/next buttons use icon-only visuals but keep the text as
 * sr-only + aria-label so all four assertions above keep resolving.
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
      : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} sur ${total}`;

  return (
    <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
      <span>{rangeText}</span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Précédent"
          title="Précédent"
          className="rounded-control inline-flex h-8 w-8 items-center justify-center border border-neutral-300 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeftIcon size={14} aria-hidden="true" />
          <span className="sr-only">Précédent</span>
        </button>

        <span className="min-w-[80px] text-center text-xs">
          Page {page}/{totalPages}
        </span>

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Suivant"
          title="Suivant"
          className="rounded-control inline-flex h-8 w-8 items-center justify-center border border-neutral-300 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowRightIcon size={14} aria-hidden="true" />
          <span className="sr-only">Suivant</span>
        </button>
      </div>
    </div>
  );
}
