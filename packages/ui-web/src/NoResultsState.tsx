'use client';

import { MagnifyingGlassIcon } from '@phosphor-icons/react';

import { Button } from './Button';

/**
 * packages/ui-web/src/NoResultsState.tsx — Phase 5.4
 * (premium-ux-system-guide.md §7): the fourth content state, distinct from
 * EmptyState ("no data at all") — this is "your search/filters matched
 * nothing". Deliberately a sibling, NOT a modification of EmptyState or
 * ErrorState (their contracts are untouched): no create-CTA here, and the
 * title echoes the active search term per §7's template.
 *
 * Same 'use client' reasoning as EmptyState — Phosphor's icon base uses
 * React context internally, so the icon element can't be evaluated in a
 * server component chunk.
 *
 * Content follows §7's French template: « Aucun résultat pour "term" » /
 * "Essayez un autre terme ou modifiez vos filtres." /
 * [Réinitialiser les filtres] (rendered only when the caller can actually
 * clear the filters).
 *
 * Shared with apps/web like EmptyState — additive export, no existing
 * call site affected.
 */
interface NoResultsStateProps {
  /** The active search term, echoed in the title per §7's template. Omit when only non-search filters are active. */
  term?: string;
  /** Defaults to §7's description line. */
  description?: string;
  /** Renders the [Réinitialiser les filtres] action when provided. */
  onClearFilters?: () => void;
  clearLabel?: string; // default: 'Réinitialiser les filtres'
}

export function NoResultsState({
  term,
  description = 'Essayez un autre terme ou modifiez vos filtres.',
  onClearFilters,
  clearLabel = 'Réinitialiser les filtres',
}: NoResultsStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
        <MagnifyingGlassIcon size={28} className="text-neutral-500" />
      </div>

      <h3 className="font-display mt-4 text-lg font-semibold text-neutral-900">
        {term ? `Aucun résultat pour « ${term} »` : 'Aucun résultat'}
      </h3>

      {description && <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>}

      {onClearFilters && (
        <Button variant="secondary" onClick={onClearFilters} className="mt-6">
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
