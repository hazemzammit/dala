'use client';

import { WarningIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';

/**
 * apps/web/src/components/shell/UnverifiedEmailBanner.tsx
 *
 * Gap-closure guide §2.8 — built from scratch, confirmed with Hazem
 * (neither web nor mobile had this before; mobile's own dashboard.tsx
 * lists it as "STILL CUT"). Pairs with the real server-side write-block
 * added to every operational action (`requireVerifiedEmail`,
 * `lib/emailVerification.ts`) — this banner is the visible half of that,
 * not just cosmetic.
 *
 * Dismissal is in-memory only, same trade-off `AnnouncementBanner.tsx`
 * documents for the same reason: no spec section requires this specific
 * banner to persist its dismissal across reloads, unlike the profile-
 * completion checklist which explicitly must (Doc 01 §1.3.12). Reappearing
 * after a refresh is a mild nag, by design, for an account that genuinely
 * still can't do most things.
 */
export function UnverifiedEmailBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="border-warning/20 bg-warning/10 flex items-center justify-between gap-4 border-b px-6 py-2.5">
      <div className="flex items-center gap-2">
        <WarningIcon size={16} className="text-warning shrink-0" />
        <p className="text-sm text-neutral-900">
          Confirmez votre adresse e-mail pour pouvoir créer et modifier des données — vérifiez votre
          boîte de réception pour le lien de confirmation.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Fermer"
        className="text-neutral-500 hover:text-neutral-900"
      >
        <XIcon size={16} />
      </button>
    </div>
  );
}
