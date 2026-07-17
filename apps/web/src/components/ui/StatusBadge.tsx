/**
 * apps/web/src/components/ui/StatusBadge.tsx
 *
 * Doc 05 §4 — "Rounded-full, small dot + label, never a full-width banner
 * for row-level status." Doc 05 §3.5 — "Status as colored pill-badges
 * (Payé/En attente/Refusé), never colored table-row backgrounds."
 */
type StatusVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const variantClasses: Record<StatusVariant, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  // info deliberately reuses accent — see packages/design-tokens' own
  // comment: "never introduce a second cool color."
  info: 'bg-accent-50 text-accent-600',
  neutral: 'bg-neutral-100 text-neutral-500',
};

const dotClasses: Record<StatusVariant, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
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
