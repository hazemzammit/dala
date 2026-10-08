'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Card } from './Card';

/**
 * packages/ui-web/src/ToastProvider.tsx
 *
 * premium-ux-system-guide.md §9 (Phase 6.1) — the toast/undo mechanism.
 * Mounted ONCE in apps/admin's (admin)/layout.tsx; nothing in the app
 * dispatches toasts yet — later steps (§18's per-page notes) decide which
 * actions convert, per §9's [DECISION]: undo-toast only for reversible,
 * low-blast-radius actions; delete/revoke keep ConfirmTypingDialog.
 *
 * Spec (§9 verbatim): stack bottom-right, max 3 visible, 5s auto-dismiss
 * (8s if it has an `Annuler` action). Position uses logical `end-*`
 * (design-tokens' RTL_CONVENTION_NOTE) — `end-6` is right in LTR.
 *
 * A11y (§12): stack is aria-live="polite" (async results announced),
 * each toast role="status"; the icon-only close button carries an
 * accessible name (§14). Motion (§8): motion-safe: transition only —
 * no @keyframes introduced (that would touch the Tailwind preset, out
 * of scope for this step).
 */

export interface ToastAction {
  /** §9's undo affordance — "Annuler" in practice; label is caller's choice. */
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Overrides the default duration. Rarely needed; here for tests. */
  durationMs?: number;
}

interface ToastEntry {
  id: number;
  message: string;
  action?: ToastAction;
  durationMs: number;
}

type ToastFn = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

const MAX_VISIBLE = 3;
const BASE_DURATION_MS = 5000;
const WITH_ACTION_DURATION_MS = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastFn>((message, options) => {
    const durationMs =
      options?.durationMs ?? (options?.action ? WITH_ACTION_DURATION_MS : BASE_DURATION_MS);
    const id = nextId.current++;
    setToasts((current) => [
      // Cap the stack at MAX_VISIBLE: the OLDEST entries fall off first —
      // the newest call is always visible (§9 "max 3 visible").
      ...(current.length >= MAX_VISIBLE
        ? current.slice(current.length - MAX_VISIBLE + 1)
        : current),
      { id, message, action: options?.action, durationMs },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-6 end-6 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(t.id), t.durationMs);
    return () => window.clearTimeout(timer);
  }, [t.id, t.durationMs, onDismiss]);

  return (
    <Card
      raised
      role="status"
      className="pointer-events-auto flex items-start gap-3 p-4 motion-safe:transition-opacity motion-safe:duration-150"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-[1.4] text-neutral-900">{t.message}</p>
        {t.action && (
          <button
            type="button"
            onClick={() => {
              t.action?.onClick();
              onDismiss(t.id);
            }}
            className="text-danger mt-1 text-[13px] font-medium hover:opacity-80 motion-safe:transition-opacity motion-safe:duration-150"
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => onDismiss(t.id)}
        className="rounded-control -me-1 -mt-1 p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </Card>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
