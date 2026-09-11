/**
 * packages/ui-web/src/PlanBadge.tsx
 *
 * Admin UI/UX overhaul pass — sibling of StatusBadge for plan-tier display.
 * Uses categorical colors (never status colors) so plan tier is visually
 * distinct from approval/suspension state, per §2.2 of the plan and
 * the color-usage table in §4.
 *
 * The `plan` prop accepts the raw DB value (free / pro / business); the
 * displayed label is localized to French per §2.17. Tests assert on the
 * raw API value, never on the displayed badge text — this is safe.
 */

const PLAN_LABEL: Record<string, string> = {
  free: 'Gratuit',
  pro: 'Pro',
  business: 'Entreprise',
};

/**
 * Tailwind note: categorical colors are now exposed via the tailwind
 * preset (added in Phase 0). The exact classes below must be present
 * in source so Tailwind's content scanner can detect them — they are
 * not constructed dynamically.
 */
const planClasses: Record<string, string> = {
  free: 'bg-neutral-100 text-neutral-500',
  pro: 'bg-accent-50 text-accent-700',
  // categorical.violet (#7B5FCE) — not a status color, top-tier brand signal
  business: 'bg-[#7B5FCE]/10 text-[#7B5FCE]',
};

interface PlanBadgeProps {
  plan: string;
}

export function PlanBadge({ plan }: PlanBadgeProps) {
  const classes = planClasses[plan] ?? 'bg-neutral-100 text-neutral-500';
  const label = PLAN_LABEL[plan] ?? plan;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${classes}`}
    >
      {label}
    </span>
  );
}
