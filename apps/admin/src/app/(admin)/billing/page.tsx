import { PageHero } from '@dala/ui-web';
import { ReceiptIcon } from '@phosphor-icons/react/ssr';

import { BillingTable } from './BillingTable';

/**
 * Doc 04 §4.3.7 — Billing.
 *
 * Was a stated read-only scope cut (no subscriptions table existed
 * anywhere in this schema, Doc 00 §0.5's TVA/tax decision was still
 * open). Migration 0043 closed that gap: organizations.subscription_status
 * / billing_cycle_start / seat_price_millimes plus a full billing_cycles
 * table now exist for real, so this remediation phase rebuilt the screen
 * against them — MRR, the real per-org subscriptions table, and the four
 * spec-listed manual actions (extend expiry, manual discount, mark paid
 * outside Konnect, cancel).
 *
 * Still NOT built here, on purpose (Doc 00 §0.5's TVA decision doesn't
 * block this anymore, but these are still a genuinely separate, bigger
 * lift):
 *   - Any real Konnect payment flow — that boundary stays in
 *     supabase/functions/_shared/paymentProvider.ts and its Edge
 *     Functions (0043's own header), never in this Next.js route. This
 *     screen only reads/displays real payment state and performs the
 *     four manual, non-provider actions.
 *   - Time-series MRR trend / churn-over-time — subscription_status only
 *     just started accumulating real history as of this phase, so
 *     there's no meaningful trend to chart yet.
 *
 * Phase 5 (plan §5.8) — the bare <h1> + <p> becomes a PageHero (icon
 * ReceiptIcon, same title "Facturation"); the existing description
 * paragraph is moved into `description` verbatim.
 */
export default function BillingPage() {
  return (
    <div>
      <PageHero
        icon={ReceiptIcon}
        title="Facturation"
        description="Abonnements, MRR et actions manuelles par organisation."
      />
      <BillingTable />
    </div>
  );
}
