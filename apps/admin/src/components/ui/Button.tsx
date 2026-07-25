'use client';

import { forwardRef } from 'react';

/**
 * apps/admin/src/components/ui/Button.tsx
 *
 * Mirrors apps/web/src/components/ui/Button.tsx exactly (Doc 05 §3.6 —
 * admin uses the same components/tokens as the contractor app, just a
 * denser layout). Not cross-imported from apps/web (separate app, separate
 * deploy, your collaborator owns that code on their own branch) — kept as
 * an identical sibling file instead so the two never accidentally diverge
 * in behavior while staying independently deployable.
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
  // Admin-only addition: every destructive admin action (suspend, delete,
  // execute raw SQL) needs a visually distinct confirm button — web's
  // three variants don't cover this since the contractor app has fewer
  // truly destructive actions.
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-80',
  // Used only by the Database Explorer's "approve and execute" action —
  // the one place a green confirm reads more correctly than accent teal.
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
