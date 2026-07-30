import { BillingTable } from './BillingTable';

/**
 * Doc 06 §6.3 — Billing/Subscriptions.
 *
 * Stated scope cut: no subscriptions table exists anywhere in this
 * schema, Doc 00 §0.5's TVA/tax decision is still open, and Doc 01
 * explicitly defers seat-based pricing tiers past MVP — so MRR, churn,
 * renewal dates, and per-subscription actions (extend, discount, mark
 * paid, cancel) all require a real product/schema decision that hasn't
 * been made. This is the smallest honest thing buildable today: a
 * read-only cross-org plan view, backed by the real `organizations.plan`
 * column. Plan changes still go through the existing, already
 * audit-logged action on each org's detail page — not duplicated here.
 */
export default function BillingPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Facturation</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Aucune table d'abonnement/facturation n'existe encore (décision TVA en attente, voir Doc 00
        §0.5) — vue en lecture seule du plan de chaque organisation. Le changement de plan se fait
        depuis la fiche de l'organisation.
      </p>
      <BillingTable />
    </div>
  );
}
