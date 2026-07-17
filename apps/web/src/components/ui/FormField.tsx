'use client';

import { Eye, EyeSlash } from '@phosphor-icons/react';
import { forwardRef, useId, useState } from 'react';

/**
 * apps/web/src/components/ui/FormField.tsx
 *
 * Doc 05 §2.5 — "Field label above input (never placeholder-as-label)."
 * Doc 05 §4 — FormField states: default, focused (accent border), error
 * (danger border + helper text), disabled.
 *
 * This is THE input component for every form in the product from here on —
 * every one of the ~15 form screens Doc 05 references should compose this
 * rather than a raw <input>, so focus/error styling never drifts screen to
 * screen (see docs/CONTRIBUTING.md's note on shared-file drift).
 */
interface FormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, type = 'text', className = '', disabled, ...props },
  ref,
) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const resolvedType = isPassword && showPassword ? 'text' : type;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-900">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          ref={ref}
          type={resolvedType}
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
            isPassword ? 'pe-10' : '',
            className,
          ].join(' ')}
          {...props}
        />

        {/* Doc 05 §5 checklist: icons switch outline→filled on active state
            rather than just changing color — the eye/eye-slash swap here is
            that pattern applied to a toggle rather than a nav item. */}
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            className="absolute inset-y-0 end-0 flex items-center pe-3 text-neutral-500"
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          >
            {showPassword ? <EyeSlash size={18} weight="fill" /> : <Eye size={18} />}
          </button>
        )}
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}
    </div>
  );
});
