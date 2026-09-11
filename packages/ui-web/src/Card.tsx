/**
 * packages/ui-web/src/Card.tsx
 *
 * Extracted from apps/web/src/components/ui/Card.tsx and
 * apps/admin/src/components/ui/Card.tsx (Phase 19B, item 3) — the two
 * were byte-identical; no behavioral decision needed.
 *
 * Doc 05 §5 checklist: "Is the background a soft off-white, not pure
 * white, behind raised neutral-0 cards?" and "Is there restraint on
 * shadows — one soft resting shadow, one raised shadow, nothing heavier?"
 *
 * Admin UI/UX overhaul pass — two new optional props added (additive only;
 * every existing call site that omits them renders byte-identically):
 *   `interactive` — hover: shadow deepens + subtle upward lift (150ms ease).
 *                   Used on clickable cards (IconStatCard, EntityCard).
 *   `tone`        — optional 3px logical-start (RTL-safe) accent border.
 *                   Used for section-level emphasis (SectionCard, warnings).
 */
type CardTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const toneClasses: Record<CardTone, string> = {
  accent: 'border-s-4 border-s-accent-600',
  success: 'border-s-4 border-s-success',
  warning: 'border-s-4 border-s-warning',
  danger: 'border-s-4 border-s-danger',
  neutral: 'border-s-4 border-s-neutral-300',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
  interactive?: boolean;
  tone?: CardTone;
}

export function Card({
  raised = false,
  interactive = false,
  tone,
  className = '',
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={[
        'rounded-card bg-neutral-0 border border-neutral-100',
        raised
          ? 'shadow-[0_4px_10px_rgba(17,19,24,0.08),0_12px_24px_rgba(17,19,24,0.06)]'
          : 'shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]',
        interactive
          ? 'cursor-pointer transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(17,19,24,0.08),0_12px_24px_rgba(17,19,24,0.06)]'
          : '',
        tone ? toneClasses[tone] : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
