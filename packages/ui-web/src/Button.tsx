'use client';

import { forwardRef } from 'react';

/**
 * packages/ui-web/src/Button.tsx
 *
 * Extracted from apps/web/src/components/ui/Button.tsx and
 * apps/admin/src/components/ui/Button.tsx (Phase 19B, item 3) — the two
 * were already byte-identical except for one real difference, called out
 * below. Pure extraction, not a redesign: every visible behavior for both
 * apps' EXISTING call sites is unchanged.
 *
 * BEHAVIORAL DIFFERENCE FOUND (flagged, not silently resolved): Admin's
 * `variant` type included `'danger'` and `'success'`, which Web's did not
 * — Admin's own comment explained why ("every destructive admin action...
 * needs a visually distinct confirm button... web's three variants don't
 * cover this since the contractor app has fewer truly destructive
 * actions"). Resolution: the union type includes both — Web simply never
 * passes `'danger'`/`'success'` (unchanged for Web), Admin keeps using
 * them exactly as before (unchanged for Admin). Neither app's behavior
 * was discarded.
 */
type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger' | 'success';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-800',
  secondary:
    'bg-neutral-0 text-neutral-900 border border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200',
  text: 'bg-transparent text-accent-600 hover:text-accent-700 px-0',
  // Admin-only in practice (Web never passes these) — every destructive
  // admin action (suspend, delete, execute raw SQL) needs a visually
  // distinct confirm button.
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
  // Admin-only in practice — used only by the Database Explorer's
  // "approve and execute" action, the one place a green confirm reads
  // more correctly than accent teal.
  success: 'bg-success text-white hover:opacity-90 active:opacity-80',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    loading = false,
    fullWidth = false,
    disabled,
    className = '',
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        'rounded-control relative inline-flex items-center justify-center px-4 py-2.5',
        'text-[15.5px] font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
        fullWidth ? 'w-full' : 'w-auto',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...props}
    >
      {/* Width doesn't jump when loading starts: the label stays in the
          layout (invisible) and the spinner is absolutely positioned over it,
          per Doc 05 §4's "button width doesn't jump" requirement. */}
      <span className={loading ? 'invisible' : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </span>
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  );
}
