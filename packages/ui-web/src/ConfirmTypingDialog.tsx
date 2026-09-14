'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Button } from './Button';
import { Card } from './Card';
import { FormField } from './FormField';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * packages/ui-web/src/ConfirmTypingDialog.tsx
 *
 * Doc 05 §1.7c (Tier 3) — extracted from
 * apps/admin/src/components/ui/ConfirmTypingDialog.tsx (Phase 19D,
 * closing a follow-up 19C surfaced). 19B's original 8-component
 * migration never included this one; 19C found the gap and built a
 * temporary web-local mirror (apps/web/src/components/ui/
 * ConfirmTypingDialog.tsx) just to unblock Advances' web confirmation
 * gating without reopening apps/admin, which was out of scope for that
 * phase. Both call sites now import this one; both mirrors are retired.
 *
 * `requireReason` stays optional, default `false` — Web's Advances
 * usage never passes it (there is nowhere server-side to persist a
 * reason for approve_advance/reject/mark_salary_cycle_paid yet; see the
 * reason-persistence backend gap named in 19C's and this phase's
 * reports), so this preserves Web's exact existing no-reason-field
 * behavior. Admin's 4 real usages (UsersTable, AdminUsersTable,
 * OrgDetail, OrganizationsTable — `apps/admin/src/components/shell/
 * GlobalSearch.tsx`'s mention of this component is a comment only, not
 * an actual import/usage, corrected here) keep passing `requireReason`
 * exactly as before, unchanged.
 */
export function ConfirmTypingDialog({
  title,
  description,
  confirmValue,
  confirmLabel = 'Confirmer',
  requireReason = false,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmValue: string;
  confirmLabel?: string;
  requireReason?: boolean;
  /** Admin's 4 real usages are all genuinely destructive actions (suspend,
   * delete, revoke) and never pass this, relying on the `true` default to
   * match this component's original hardcoded `variant="danger"`. Web's
   * Advances usage needs both tones from the same dialog (Approve is a
   * positive action, Reject is a destructive one) — that need is what
   * this prop was added for during the 19D consolidation. */
  destructive?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reasonId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const canConfirm = typed === confirmValue && (!requireReason || reason.trim().length >= 10);

  // Phase 6.4 (premium-ux-system-guide.md §9/§10/§12) — focus management:
  // trap Tab/Shift+Tab inside the dialog while open, close on ESC, and
  // restore focus to the triggering element on close. Mirrors the proven
  // ConfirmDialog.tsx mechanism. Call sites render this conditionally, so
  // mount = open (the trigger is focused just before mount).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    container.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
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
      await onConfirm(reason);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md outline-none"
      >
        <Card raised className="p-6">
          <h2 className="font-display text-lg font-semibold text-neutral-900">{title}</h2>
          <p className="mt-2 text-sm text-neutral-500">{description}</p>

          {requireReason && (
            <div className="mt-4">
              <label htmlFor={reasonId} className="text-sm font-medium text-neutral-900">
                Motif (10 caractères minimum)
              </label>
              <textarea
                id={reasonId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              />
            </div>
          )}

          <div className="mt-4">
            <FormField
              label={`Tapez "${confirmValue}" pour confirmer`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={onCancel}>
              Annuler
            </Button>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={handleConfirm}
              disabled={!canConfirm}
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
