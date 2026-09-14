'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * packages/ui-web/src/ToggleChip.tsx
 *
 * Phase 4.7 (§2.2) — promotes the "File de vérification" inline
 * conditional class string (OrganizationsTable.tsx's raw <button>) into
 * a real shared control, and becomes the reusable pattern for any future
 * list/view filter toggle (Storage's §4.7 status filter uses it too).
 *
 * §2.2's literal spec: same height as §2.1's controls, rounded-control,
 * pressed = border-accent-600 bg-accent-50 text-accent-700 (verified
 * against the call site — that half is byte-identical today), unpressed
 * = border-neutral-300 text-neutral-600. aria-pressed carries the state
 * semantically (Playwright's [pressed] assertions resolve off it, same
 * mechanism as ViewToggle's buttons).
 *
 * The label string and its title/tooltip are the caller's — the exact
 * "File de vérification" test-contract string and the §2.2 tooltip text
 * stay with the call site (Step 6). §2.2 discrepancy recorded for that
 * step: the call site's unpressed border is neutral-200 today, not the
 * spec's neutral-300 — the spec wins; the call site moves in Step 6.
 *
 * Pure addition in this step — wired into NO page yet (Step 6 adopts it).
 */

interface ToggleChipProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'className'
> {
  pressed: boolean;
  children: ReactNode;
}

export function ToggleChip({ pressed, title, children, ...rest }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      className={`rounded-control focus:border-accent-600 focus-visible:ring-accent-600 inline-flex h-10 shrink-0 items-center border px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-safe:transition-colors motion-safe:duration-150 ${
        pressed
          ? 'border-accent-600 bg-accent-50 text-accent-700'
          : 'border-neutral-300 text-neutral-600 hover:bg-neutral-50'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
