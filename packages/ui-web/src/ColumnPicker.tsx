'use client';

import { CaretDownIcon, CaretUpIcon, GearIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button } from './Button';

export interface ColumnPickerColumn {
  key: string;
  header: string;
  /** Locked columns (e.g. a row-actions column) can't be hidden or moved. */
  locked?: boolean;
}

interface ColumnPickerProps {
  columns: ColumnPickerColumn[];
  hiddenKeys: string[];
  /** Current column order (every current key; the caller materializes it). */
  order: string[];
  onToggle: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onReset: () => void;
  label?: string;
}

/**
 * packages/ui-web/src/ColumnPicker.tsx — Phase 5.5 (§6.3): the
 * "Colonnes ⚙" control for FilterBar's trailing slot — per-column
 * visibility checkboxes + Monter/Descendre reorder, with locked columns
 * (a row-actions column can't be hidden without stranding every action)
 * and a Réinitialiser reset. The popover portals to <body> with
 * position:fixed — same clip-escape rationale as the Phase-5.2 row menus
 * (table cards are overflow-hidden, and the popover must also clear
 * viewport edges) — with ESC/outside-click close and focus returned to
 * the trigger. Additive export; nothing existing changes.
 */
export function ColumnPicker({
  columns,
  hiddenKeys,
  order,
  onToggle,
  onMove,
  onReset,
  label = 'Colonnes',
}: ColumnPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || wrapRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      wrapRef.current?.querySelector('button')?.focus();
    }
    document.addEventListener('mousedown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open]);

  // Position below the trigger (right-aligned to it), flipping above when
  // it would overflow the viewport bottom — same flip rule as the menus.
  useEffect(() => {
    if (!open || !menuRef.current || !wrapRef.current) return;
    const t = wrapRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let top = t.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, t.top - m.height - 4);
    const left = Math.max(8, t.right - m.width);
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const t = wrapRef.current?.getBoundingClientRect();
    if (t) setPos({ top: t.bottom + 4, left: Math.max(8, t.right - 256) }); // 256 = w-64
    setOpen(true);
  }

  // Stored order ∩ current columns, then any current column the stored
  // order doesn't know yet (first interaction / conditional columns) in
  // natural order — the picker always lists every current column.
  const orderedKeys = useMemo(() => {
    const known = order.filter((key) => columns.some((c) => c.key === key));
    const unknown = columns.map((c) => c.key).filter((key) => !known.includes(key));
    return [...known, ...unknown];
  }, [columns, order]);

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="rounded-control bg-neutral-0 inline-flex items-center gap-1.5 border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition-colors duration-150 hover:border-neutral-300 hover:text-neutral-900"
      >
        <GearIcon size={14} aria-hidden="true" />
        {label}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="dialog"
            aria-label={label}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 50 }}
            className="bg-neutral-0 w-64 rounded-lg border border-neutral-200 py-1 shadow-[0_8px_24px_rgba(17,19,24,0.12)]"
          >
            {orderedKeys.map((key, index) => {
              const column = columns.find((c) => c.key === key);
              if (!column) return null;
              const hidden = hiddenKeys.includes(key);
              return (
                <div key={key} className="flex items-center gap-2 px-3 py-1">
                  <label className="flex flex-1 cursor-pointer items-center gap-2 py-1 text-sm text-neutral-900">
                    <input
                      type="checkbox"
                      checked={!hidden}
                      disabled={column.locked}
                      onChange={() => onToggle(key)}
                      className="rounded border-neutral-300"
                    />
                    {column.header}
                  </label>
                  {!column.locked && (
                    <span className="flex items-center">
                      <button
                        type="button"
                        aria-label={`Monter ${column.header}`}
                        disabled={index === 0}
                        onClick={() => onMove(key, -1)}
                        className="rounded p-1 text-neutral-500 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CaretUpIcon size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Descendre ${column.header}`}
                        disabled={index === orderedKeys.length - 1}
                        onClick={() => onMove(key, 1)}
                        className="rounded p-1 text-neutral-500 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CaretDownIcon size={14} aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            <div className="border-t border-neutral-100 px-3 py-2">
              <Button variant="secondary" onClick={onReset} className="w-full">
                Réinitialiser
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
