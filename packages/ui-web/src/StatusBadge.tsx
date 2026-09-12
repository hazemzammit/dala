/**
 * packages/ui-web/src/StatusBadge.tsx
 *
 * Extracted from apps/web/src/components/ui/StatusBadge.tsx and
 * apps/admin/src/components/ui/StatusBadge.tsx (Phase 19B, item 3) — the
 * two were byte-identical; no behavioral decision needed.
 *
 * Doc 05 §4 — "Rounded-full, small dot + label, never a full-width banner
 * for row-level status." Doc 05 §3.5 — "Status as colored pill-badges
 * (Payé/En attente/Refusé), never colored table-row backgrounds."
 */
type StatusVariant = 'success' | 'warning' | 'warningStrong' | 'danger' | 'neutral' | 'info';

const variantClasses: Record<StatusVariant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  // Phase 5 (§5.9) — escalation step between `warning` and `danger`
  // (storage quota ≥ 950 Mo tier). Same pill anatomy, stronger amber
  // token (status.warningStrong, 5.42:1 vs white). Keeps the three quota
  // tiers visually distinct per premium-ux §18 ("don't compress
  // critical/over_limit into fewer visual states").
  warningStrong: 'bg-warningStrong/10 text-warningStrong',
  danger: 'bg-danger/10 text-danger',
  // info deliberately reuses accent — see packages/design-tokens' own
  // comment: "never introduce a second cool color."
  info: 'bg-accent-50 text-accent-600',
  neutral: 'bg-neutral-100 text-neutral-500',
};

const dotClasses: Record<StatusVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  warningStrong: 'bg-warningStrong',
  danger: 'bg-danger',
  info: 'bg-accent-600',
  neutral: 'bg-neutral-500',
};

interface StatusBadgeProps {
  variant: StatusVariant;
  children: React.ReactNode;
}

export function StatusBadge({ variant, children }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${variantClasses[variant]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[variant]}`} />
      {children}
    </span>
  );
}
