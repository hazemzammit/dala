'use client';

import { Card, Button } from '@dala/ui-web';
import type { ReactNode } from 'react';

/**
 * apps/web/src/components/ui/ConfirmDialog.tsx
 *
 * No confirm-dialog primitive existed in apps/web before this — every
 * existing destructive action (vehicle/worker deletes, etc.) either has no
 * confirm step yet or is a simple window.confirm. Mobile has a themed
 * `ConfirmDialog` component for security-relevant destructive actions
 * (disabling 2FA); this is the same idea for web, reusable for account
 * deletion (§1.5) too.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  loading,
  destructive = true,
  confirmDisabled = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  destructive?: boolean;
  /** Optional extra gate on the confirm button, alongside `loading` —
   * e.g. a mandatory reason field rendered via `children` not yet being
   * filled in. Default false preserves every existing call site. */
  confirmDisabled?: boolean;
  /** Optional extra content rendered between the description and the
   * button row — e.g. a reason field. Default none preserves every
   * existing call site's exact layout. */
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="w-full max-w-sm p-6">
        <h2 className="font-display text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-neutral-500">{description}</p>
        {children}
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="primary"
            className={destructive ? '!bg-danger hover:!bg-danger/90 active:!bg-danger/80' : ''}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
