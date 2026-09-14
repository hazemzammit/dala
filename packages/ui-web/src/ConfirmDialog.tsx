'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from './Button';
import { Card } from './Card';

/**
 * packages/ui-web/src/ConfirmDialog.tsx
 *
 * premium-ux-system-guide.md §10 tier 1 (Phase 6.2) — the "light confirm":
 * title + one-line consequence + Annuler/Confirm, for reversible actions
 * where undo-toast is too casual but ConfirmTypingDialog's typed gate is
 * overkill. Built additively alongside — never replacing — the existing
 * dialog tiers: tier 2/3 stay ConfirmTypingDialog (NOT modified here), and
 * no page is wired to this component yet (that's a later, gated step).
 *
 * Name note: apps/web and apps/mobile each have their own app-local
 * ConfirmDialog (web's has an `open` prop). Neither is involved here;
 * this export is the shared tier-1 component the guide specifies, and
 * adds a third same-named component in the repo — flagged in the phase
 * report rather than silently resolved.
 *
 * A11y (§10 "all three" + §12): ESC closes; focus is trapped (Tab wraps
 * inside the dialog) while open; focus returns to the trigger element on
 * close (captured at mount — dialogs are condition-mounted, so mount =
 * open, matching ConfirmTypingDialog's call-site pattern). Same ESC +
 * stopPropagation + focus-return mechanism as ColumnPicker's popover.
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  /** One-line consequence — keep it a single sentence (§10 tier 1). */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Matches ConfirmTypingDialog's convention: default danger (tier 1
   * confirms are usually gated reversible actions); false → primary. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Focus returns to the trigger on close — the element focused when
    // the dialog mounted (call sites render this conditionally).
    const previouslyFocused = document.activeElement as HTMLElement | null;
    container.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      // Trap: Tab/Shift+Tab wrap within the dialog, never leave it.
      const focusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      ).filter((el) => el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === containerRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onCancel]);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      {/* tabIndex=-1 + initial focus = the dialog itself is announced
          (aria-labelledby) without choosing a button for the user. */}
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-md outline-none"
      >
        <Card raised className="p-6">
          <h2 id={titleId} className="font-display text-lg font-semibold text-neutral-900">
            {title}
          </h2>
          <p id={descriptionId} className="mt-2 text-sm text-neutral-500">
            {description}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={submitting}>
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={handleConfirm}
              loading={submitting}
            >
              {confirmLabel}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
