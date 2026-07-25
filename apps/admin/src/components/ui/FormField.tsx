'use client';

import { forwardRef, useId } from 'react';

/**
 * apps/admin/src/components/ui/FormField.tsx — mirrors apps/web's
 * FormField (Doc 05 §2.5 — label above input, never placeholder-as-label).
 * Admin doesn't need the password-visibility toggle web's version has for
 * its long consumer-facing signup form; TOTP/login inputs here are short
 * numeric/text fields, so this is the plain version. Add the toggle back
 * if a future admin screen needs a password field.
 */
interface FormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, className = '', disabled, ...props },
  ref,
) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-900">
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        disabled={disabled}
        aria-invalid={!!error}
        className={[
          'rounded-control bg-neutral-0 w-full border px-3 py-2.5 text-[15.5px]',
          'outline-none transition-colors duration-150',
          'placeholder:text-neutral-500',
          disabled ? 'cursor-not-allowed bg-neutral-100 text-neutral-500' : 'text-neutral-900',
          error
            ? 'border-danger focus:border-danger'
            : 'focus:border-accent-600 border-neutral-300',
          className,
        ].join(' ')}
        {...props}
      />
      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
});
