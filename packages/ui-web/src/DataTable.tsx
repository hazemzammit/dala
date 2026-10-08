'use client';

import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { Card } from './Card';
import { Pagination } from './Pagination';

/**
 * packages/ui-web/src/DataTable.tsx
 *
 * Extracted from apps/web/src/components/ui/DataTable.tsx and
 * apps/admin/src/components/ui/DataTable.tsx (Phase 19B, item 3).
 *
 * TWO BEHAVIORAL DIFFERENCES FOUND (flagged, not silently resolved):
 *
 * 1. `pagination` â€” Admin had this (prev/next controls + a page
 *    indicator, server-driven: `rows` is just the current page, this
 *    component only renders controls and calls `onPageChange`), added in
 *    an earlier "Admin remediation Tier 4.1" pass; Web never had it. This
 *    one is a pure, harmless addition â€” an optional prop nobody has to
 *    pass. Resolution: kept exactly as Admin had it. Web's call sites
 *    simply never pass `pagination`, so nothing changes for Web.
 *
 * 2. Row-selection reset on `rows` change â€” Admin had a `useEffect` that
 *    clears `selected` whenever the `rows` prop changes (its own comment,
 *    "Admin remediation Tier 4.3": without this, a bulk action that
 *    triggers a re-fetch could leave `selected` holding ids that are no
 *    longer on the new page, or no longer exist at all â€” e.g. after a
 *    bulk delete â€” showing a stale "N selected" bar). Web's version does
 *    NOT do this â€” selection persists across a `rows` change. This is a
 *    REAL behavior difference, not styling, and only 4 screens use
 *    `selectable` at all today (Web: MaterialsView, AdvancesView; Admin:
 *    UsersTable, OrganizationsTable) â€” not common enough to guess a
 *    single global default is safe for both. Resolution: new opt-in prop
 *    `resetSelectionOnRowsChange`, defaulting to `false` (Web's original,
 *    unchanged behavior when the prop isn't passed). Admin's two
 *    `selectable` call sites (UsersTable.tsx, OrganizationsTable.tsx)
 *    were updated to pass `resetSelectionOnRowsChange` explicitly, so
 *    Admin's visible behavior is exactly what it was before this
 *    extraction. Web's two `selectable` call sites were NOT touched.
 *
 * Doc 05 Â§4 â€” "DataTable: sortable header, row hover, row-select
 * checkbox, bulk-action toolbar." Doc 05 Â§3.5 â€” "back-office density
 * without feeling like generic back-office software" â€” plain HTML table,
 * no external table library.
 *
 * Phase 4.7 (Â§2.5) â€” header row gains the page-background tint
 * (`bg-neutral-25`) and rows gain a hairline left accent on hover
 * (`border-l-2 border-l-transparent hover:border-l-accent-200`) â€” the
 * hover-only treatment Â§2.5's [DECISION] picked over zebra striping
 * (Doc 05's "colored table-row backgrounds" prohibition for status
 * stays intact). Applies to both apps â€” every table-bearing screen.
 *
 * Phase 4.7 (Â§5 Services-Health item) â€” new optional `bare` prop skips
 * this component's own Card wrapper (renders the <table> directly) for
 * tables nested inside a SectionCard, where the SectionCard already
 * supplies the one raised boundary. Default `false` â€” zero change for
 * every existing call site in both apps; consumers adopt it in Step 10.
 */
export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  width?: string;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

// Phase 5.5 (Â§6.4) â€” row/header padding density levels.
export type TableDensity = 'confortable' | 'defaut' | 'compact';

// 'defaut' is the pre-5.5 rendering, byte-identical; web and un-wired call
// sites never pass the prop, so nothing changes for them.
const densityCellClasses: Record<TableDensity, string> = {
  confortable: 'px-4 py-4',
  defaut: 'px-4 py-3',
  compact: 'px-3 py-1.5',
};

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[]) => ReactNode;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  // When provided, renders prev/next + a page indicator below the table.
  // `rows` is still just the CURRENT page's rows â€” pagination here is
  // server-driven (the caller's fetch already applied .range()), this
  // component only renders the controls and calls onPageChange; it does
  // not slice `rows` itself.
  pagination?: DataTablePagination;
  // See "BEHAVIORAL DIFFERENCE FOUND" #2 above. Default `false` matches
  // Web's original (and this component's default) behavior.
  resetSelectionOnRowsChange?: boolean;

  // Phase 4.7 (Â§5 Services-Health item) â€” skips this component's own Card
  // wrapper and renders the <table> directly, for tables nested inside a
  // SectionCard (where the SectionCard already supplies the one raised
  // boundary â€” otherwise card-in-card). Default `false` keeps every
  // existing call site's rendering byte-identical; consumers adopt it
  // in Step 10.
  bare?: boolean;

  // Phase 5.5 (Â§6.4) â€” row/header padding density; see densityCellClasses.
  // Default 'defaut' keeps every existing call site's rendering
  // byte-identical.
  density?: TableDensity;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  selectable = false,
  bulkActions,
  onRowClick,
  emptyState,
  pagination,
  resetSelectionOnRowsChange = false,
  bare = false,
  density = 'defaut',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (resetSelectionOnRowsChange) {
      setSelected(new Set());
    }
  }, [rows]);

  const sortedRows = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return rows;

    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    if (sortKey === column.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column.key);
      setSortDir('asc');
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === sortedRows.length ? new Set() : new Set(sortedRows.map(getRowId)),
    );
  }

  if (rows.length === 0 && emptyState) {
    return bare ? <>{emptyState}</> : <Card>{emptyState}</Card>;
  }

  const table = (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="bg-neutral-25 border-b border-neutral-100">
          {selectable && (
            <th className={`w-10 ${densityCellClasses[density]}`}>
              <input
                type="checkbox"
                checked={selected.size === sortedRows.length && sortedRows.length > 0}
                onChange={toggleAll}
                className="rounded border-neutral-300"
              />
            </th>
          )}
          {columns.map((column) => (
            <th
              key={column.key}
              style={{ width: column.width }}
              className={`${densityCellClasses[density]} text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500 ${
                column.align === 'right' ? 'text-right' : 'text-left'
              }`}
            >
              {column.sortValue ? (
                <button
                  onClick={() => toggleSort(column)}
                  className="focus-visible:ring-accent-600 inline-flex items-center gap-1 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  {column.header}
                  {sortKey === column.key &&
                    (sortDir === 'asc' ? <CaretUpIcon size={12} /> : <CaretDownIcon size={12} />)}
                </button>
              ) : (
                column.header
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => {
          const id = getRowId(row);
          return (
            <tr
              key={id}
              onClick={() => onRowClick?.(row)}
              className={`hover:border-l-accent-200 hover:bg-neutral-25 group border-b border-l-2 border-neutral-100 border-l-transparent last:border-0 ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {selectable && (
                <td className={densityCellClasses[density]} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggleRow(id)}
                    className="rounded border-neutral-300"
                  />
                </td>
              )}
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`${densityCellClasses[density]} text-neutral-900 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  // Every DataTable column render function assumes it can lay out
  // freely (badges, avatars, right-aligned numbers, action buttons) —
  // on a narrow viewport that's wider than the card, and neither `Card`
  // nor the bare `<table>` had a scroll container, so content either
  // got clipped by Card's `overflow-hidden` or squeezed illegibly.
  // Wrapping the table itself in overflow-x-auto lets it scroll
  // horizontally instead, for every DataTable call site in both apps.
  const scrollableTable = <div className="overflow-x-auto">{table}</div>;

  return (
    <div>
      {selectable && selected.size > 0 && bulkActions && (
        <div className="rounded-control bg-accent-50 text-accent-700 mb-2 flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} sÃ©lectionnÃ©(s)</span>
          {bulkActions(Array.from(selected))}
        </div>
      )}

      {bare ? scrollableTable : <Card className="overflow-hidden">{scrollableTable}</Card>}

      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
