'use client';

import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';

import { Card } from './Card';

/**
 * apps/web/src/components/ui/DataTable.tsx
 *
 * Doc 05 §4 — "DataTable: sortable header, row hover, row-select checkbox,
 * bulk-action toolbar. Used by Projects, Payroll, Materials queue, Reports."
 * Doc 05 §3.5 — "back-office density without feeling like generic
 * back-office software" — plain HTML table, no external table library,
 * styled from the same tokens as everything else.
 */
export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  selectable?: boolean;
  bulkActions?: (selectedIds: string[]) => React.ReactNode;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  selectable = false,
  bulkActions,
  onRowClick,
  emptyState,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sortedRows = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortValue) return rows;

    const sorted = [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
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
    </div>
  );
}
