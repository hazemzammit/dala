import type { DataTableColumn, TableDensity } from '@dala/ui-web';

/**
 * apps/admin/src/lib/table-preferences.ts — Phase 5.5 (§6.3/6.4, §15):
 * per-table column visibility/reorder + density persistence. Extends the
 * sidebar's localStorage convention (dala-admin-sidebar-collapsed) with
 * one JSON key per table: dala-admin-table-<tableId>-prefs. All reads are
 * SSR-safe and defensive (field-by-field validation, try/catch) — a stale
 * or corrupt entry degrades to the defaults, never throws.
 */
export interface TablePrefs {
  /** Column keys currently hidden. */
  hiddenKeys: string[];
  /** Full column order; empty until first interaction (natural order). */
  order: string[];
  density: TableDensity;
}

export const DEFAULT_TABLE_PREFS: TablePrefs = { hiddenKeys: [], order: [], density: 'defaut' };

function storageKey(tableId: string) {
  return `dala-admin-table-${tableId}-prefs`;
}

export function readTablePrefs(tableId: string): TablePrefs {
  if (typeof window === 'undefined') return DEFAULT_TABLE_PREFS;
  try {
    const raw = window.localStorage.getItem(storageKey(tableId));
    if (!raw) return DEFAULT_TABLE_PREFS;
    const parsed = JSON.parse(raw) as Partial<TablePrefs>;
    return {
      hiddenKeys: Array.isArray(parsed.hiddenKeys)
        ? parsed.hiddenKeys.filter((key) => typeof key === 'string')
        : [],
      order: Array.isArray(parsed.order)
        ? parsed.order.filter((key) => typeof key === 'string')
        : [],
      density:
        parsed.density === 'confortable' || parsed.density === 'compact'
          ? parsed.density
          : 'defaut',
    };
  } catch {
    return DEFAULT_TABLE_PREFS;
  }
}

export function writeTablePrefs(tableId: string, prefs: TablePrefs): void {
  try {
    window.localStorage.setItem(storageKey(tableId), JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode / quota) — the table works, it
    // just won't remember this admin's preferences.
  }
}

/**
 * Reorder + filter a table's columns per its prefs. Keys in the stored
 * order come first (in that order), anything the stored order doesn't
 * know yet (conditional columns, new keys, empty order) keeps its natural
 * order after them — stale entries can never crash or reorder unknown
 * columns unpredictably.
 */
export function applyColumnState<T>(
  columns: DataTableColumn<T>[],
  prefs: TablePrefs,
): DataTableColumn<T>[] {
  const visible = columns.filter((column) => !prefs.hiddenKeys.includes(column.key));
  const known = visible
    .filter((column) => prefs.order.includes(column.key))
    .sort((a, b) => prefs.order.indexOf(a.key) - prefs.order.indexOf(b.key));
  const unknown = visible.filter((column) => !prefs.order.includes(column.key));
  return [...known, ...unknown];
}
