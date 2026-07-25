/**
 * apps/admin/src/components/ui/Card.tsx — mirrors apps/web's Card exactly.
 * Doc 05 §1.3: 16px radius, 1px neutral-100 border + whisper-soft shadow,
 * two elevation depths only.
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
