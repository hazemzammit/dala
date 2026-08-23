'use client';

import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { Card } from './Card';

/**
 * apps/admin/src/components/ui/DataTable.tsx — mirrored from apps/web's
 * copy as of this file's original authorship (Doc 05 §3.6: admin is
 * "tables-first" — this is the single most-used component in the whole
 * admin app: Organizations, Users, Audit Log all use it).
 *
 * Admin remediation Tier 4.1 — added the optional `pagination` prop
 * below. apps/web has its OWN separate copy of this component (not a
 * shared package — checked before writing this comment) — this change
 * only touches apps/admin's copy, so as of this addition the two are no
 * longer byte-identical. If apps/web wants the same pagination UI, that's
 * a separate change on their side (collaborator-owned, same note as
 * apps/web/AnnouncementBanner.tsx from Tier 2.2), not something this
 * remediation pass propagates automatically.
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
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Admin remediation Tier 4.3 — selection is scoped to the currently
  // loaded `rows`, not persisted across a reload. Without this, a bulk
  // action that succeeds and triggers the caller's own re-fetch would
  // leave `selected` holding ids that may no longer be on the new page
  // (or may not even exist anymore, e.g. a bulk delete), showing a
  // "N selected" bar with nothing real behind it.
  useEffect(() => {
    setSelected(new Set());
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
