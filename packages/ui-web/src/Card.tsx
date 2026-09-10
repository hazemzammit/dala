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
