/**
 * apps/web/src/components/ui/Card.tsx
 *
 * Doc 05 §5 checklist items this exists to satisfy:
 * "Is the background a soft off-white, not pure white, behind raised
 * neutral-0 cards?" and "Is there restraint on shadows — one soft resting
 * shadow, one raised shadow, nothing heavier?"
 *
 * Every card-shaped surface in the product should use this rather than
 * repeating the border/shadow utility string inline (which is what
 * StatCard and the early auth screens did before this component existed —
 * that inline duplication is exactly the drift this component removes).
 */
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  raised?: boolean;
}

export function Card({ raised = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={[
        'rounded-card bg-neutral-0 border border-neutral-100',
        raised
          ? 'shadow-[0_4px_10px_rgba(17,19,24,0.08),0_12px_24px_rgba(17,19,24,0.06)]'
          : 'shadow-[0_1px_2px_rgba(17,19,24,0.04),0_4px_12px_rgba(17,19,24,0.03)]',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </div>
  );
}
