/**
 * packages/ui-web/src/StatStrip.tsx
 *
 * Phase 4.7 (§1.4) — compact inline statistics row, replacing the plain
 * `<p className="text-sm text-neutral-500">MRR : …` summary paragraphs in
 * Billing/Storage with real Level-1 chips (premium-ux-system-guide §2:
 * `border border-neutral-100`, no shadow — a strip of controls must not
 * out-surface the page's ONE primary surface, the DataTable card).
 *
 * Not IconStatCard (that's the Dashboard's large hero-number variant —
 * reusing it here would look oversized for a one-line summary sitting
 * above a table, per §1.4's own note).
 *
 * Chip classes per §1.4 verbatim; label in the existing "field label"
 * style stacked above the value. Level 1, not Level 2.
 *
 * Pure addition in this step — wired into NO page yet (Step 8 Billing /
 * Step 9 Storage adopt it).
 */

import type { ReactNode } from 'react';

interface StatStripItem {
  label: string;
  value: ReactNode;
}

interface StatStripProps {
  items: StatStripItem[];
}

export function StatStrip({ items }: StatStripProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-control bg-neutral-0 border border-neutral-100 px-4 py-2.5"
        >
          <p className="text-[11px] font-semibold tracking-[0.04em] text-neutral-400">
            {item.label}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
