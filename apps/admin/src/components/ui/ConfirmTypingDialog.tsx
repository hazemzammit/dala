'use client';

import { useState } from 'react';

import { Button } from './Button';
import { Card } from './Card';
import { FormField } from './FormField';

/**
 * apps/admin/src/components/ui/ConfirmTypingDialog.tsx
 *
 * Admin-only component (no web equivalent — the contractor app has far
 * fewer truly destructive actions) but built from the same primitives:
 * Card(raised) for the modal surface (Doc 05 §1.3's "raised" elevation
 * tier), FormField for inputs, Button(danger) for the confirm action.
 * Client-side gate only — every route handler re-validates the same
 * confirmation value server-side before acting.
 */
export function ConfirmTypingDialog({
  title,
  description,
  confirmValue,
  confirmLabel = 'Confirmer',
  requireReason = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmValue: string;
  confirmLabel?: string;
  requireReason?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canConfirm = typed === confirmValue && (!requireReason || reason.trim().length >= 10);

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
      <Card raised className="w-full max-w-md p-6">
        <h2 className="font-display text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="mt-2 text-sm text-neutral-500">{description}</p>

        {requireReason && (
          <div className="mt-4">
            <label className="text-sm font-medium text-neutral-900">
              Motif (10 caractères minimum)
            </label>
            <textarea
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
            variant="danger"
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={submitting}
          >
            {confirmLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
