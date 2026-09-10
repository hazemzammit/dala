'use client';

import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { Card } from './Card';

/**
 * packages/ui-web/src/DataTable.tsx
 *
 * Extracted from apps/web/src/components/ui/DataTable.tsx and
 * apps/admin/src/components/ui/DataTable.tsx (Phase 19B, item 3).
 *
 * TWO BEHAVIORAL DIFFERENCES FOUND (flagged, not silently resolved):
 *
 * 1. `pagination` — Admin had this (prev/next controls + a page
 *    indicator, server-driven: `rows` is just the current page, this
 *    component only renders controls and calls `onPageChange`), added in
 *    an earlier "Admin remediation Tier 4.1" pass; Web never had it. This
 *    one is a pure, harmless addition — an optional prop nobody has to
 *    pass. Resolution: kept exactly as Admin had it. Web's call sites
 *    simply never pass `pagination`, so nothing changes for Web.
 *
 * 2. Row-selection reset on `rows` change — Admin had a `useEffect` that
 *    clears `selected` whenever the `rows` prop changes (its own comment,
 *    "Admin remediation Tier 4.3": without this, a bulk action that
 *    triggers a re-fetch could leave `selected` holding ids that are no
 *    longer on the new page, or no longer exist at all — e.g. after a
 *    bulk delete — showing a stale "N selected" bar). Web's version does
 *    NOT do this — selection persists across a `rows` change. This is a
 *    REAL behavior difference, not styling, and only 4 screens use
 *    `selectable` at all today (Web: MaterialsView, AdvancesView; Admin:
 *    UsersTable, OrganizationsTable) — not common enough to guess a
 *    single global default is safe for both. Resolution: new opt-in prop
 *    `resetSelectionOnRowsChange`, defaulting to `false` (Web's original,
 *    unchanged behavior when the prop isn't passed). Admin's two
 *    `selectable` call sites (UsersTable.tsx, OrganizationsTable.tsx)
 *    were updated to pass `resetSelectionOnRowsChange` explicitly, so
 *    Admin's visible behavior is exactly what it was before this
 *    extraction. Web's two `selectable` call sites were NOT touched.
 *
 * Doc 05 §4 — "DataTable: sortable header, row hover, row-select
 * checkbox, bulk-action toolbar." Doc 05 §3.5 — "back-office density
 * without feeling like generic back-office software" — plain HTML table,
 * no external table library.
 */
export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
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

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[]) => React.ReactNode;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
  // When provided, renders prev/next + a page indicator below the table.
  // `rows` is still just the CURRENT page's rows — pagination here is
  // server-driven (the caller's fetch already applied .range()), this
  // component only renders the controls and calls onPageChange; it does
  // not slice `rows` itself.
  pagination?: DataTablePagination;
  // See "BEHAVIORAL DIFFERENCE FOUND" #2 above. Default `false` matches
  // Web's original (and this component's default) behavior.
  resetSelectionOnRowsChange?: boolean;
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
    return <Card>{emptyState}</Card>;
  }

  return (
    <div>
      {selectable && selected.size > 0 && bulkActions && (
        <div className="rounded-control bg-accent-50 text-accent-700 mb-2 flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="font-medium">{selected.size} sélectionné(s)</span>
          {bulkActions(Array.from(selected))}
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-100">
              {selectable && (
                <th className="w-10 px-4 py-3">
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
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.sortValue ? (
                    <button
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1 hover:text-neutral-900"
                    >
                      {column.header}
                      {sortKey === column.key &&
                        (sortDir === 'asc' ? (
                          <CaretUpIcon size={12} />
                        ) : (
                          <CaretDownIcon size={12} />
                        ))}
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
                  className={`hover:bg-neutral-25 border-b border-neutral-100 last:border-0 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                      className={`px-4 py-3 text-neutral-900 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {pagination && (
        <div className="mt-3 flex items-center justify-between text-sm text-neutral-500">
          <span>
            {pagination.total === 0
              ? '0 résultat'
              : `${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total,
                )} sur ${pagination.total}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-control border border-neutral-300 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              Précédent
            </button>
            <span className="text-xs">
              Page {pagination.page}/
              {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
            </span>
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page * pagination.pageSize >= pagination.total}
              className="rounded-control border border-neutral-300 px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
