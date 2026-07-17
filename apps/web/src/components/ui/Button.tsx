'use client';

import { forwardRef } from 'react';

/**
 * apps/web/src/components/ui/Button.tsx
 *
 * Doc 05 §4 — PrimaryButton: default, pressed, disabled, loading (inline
 * spinner replaces label, button width doesn't jump). Full-width on mobile
 * forms is mobile's own Tamagui Button (apps/mobile/src/components/ui/Button.tsx)
 * — this is the web version, auto-width by default per the same spec line.
 *
 * variant "primary" is the only saturated-color button (Doc 05 §5 checklist:
 * "teal is the only saturated color doing active work"). "secondary" and
 * "text" exist for the form footer links (Doc 05 §2.5: "secondary/text
 * actions below it, smaller and neutral-500").
 */
type ButtonVariant = 'primary' | 'secondary' | 'text';

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
