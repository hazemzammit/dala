'use client';

import { Eye, EyeSlash } from '@phosphor-icons/react';
import { forwardRef, useId, useState } from 'react';

/**
 * packages/ui-web/src/FormField.tsx
 *
 * Extracted from apps/web/src/components/ui/FormField.tsx and
 * apps/admin/src/components/ui/FormField.tsx (Phase 19B, item 3).
 *
 * BEHAVIORAL DIFFERENCE FOUND (flagged, not silently resolved): Web
 * auto-shows a password-visibility eye-icon toggle whenever
 * `type="password"`. Admin's version has no toggle at all — its own
 * comment claimed this was fine because "TOTP/login inputs here are
 * short numeric/text fields." That comment turned out to be stale:
 * `apps/admin/src/app/(auth)/login/LoginForm.tsx` DOES pass
 * `type="password"` — Admin currently renders a plain, non-toggleable
 * password input there, it just isn't a numeric/text field as the
 * comment claimed.
 *
 * Resolution: kept Web's auto-toggle-on-`type="password"` as the
 * default (`showPasswordToggle` defaults to `type === 'password'`) so
 * ALL of Web's existing password fields need zero changes and keep their
 * toggle exactly as before. Added an explicit opt-out,
 * `showPasswordToggle={false}`, on Admin's one password field
 * (`LoginForm.tsx`) so Admin's login screen keeps its current plain
 * appearance instead of silently gaining a new eye icon it never had.
 * This was the minimal-diff option — the alternative (making the toggle
 * fully opt-in) would have required editing five Web call sites instead
 * of one Admin call site for the same net behavior.
 *
 * Doc 05 §2.5 — "Field label above input (never placeholder-as-label)."
 * Doc 05 §4 — FormField states: default, focused (accent border), error
 * (danger border + helper text), disabled.
 */
interface FormFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  showPasswordToggle?: boolean;
}

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(function FormField(
  { label, error, type = 'text', className = '', disabled, showPasswordToggle, ...props },
  ref,
) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const showToggle = showPasswordToggle ?? isPassword;
  const resolvedType = isPassword && showToggle && showPassword ? 'text' : type;

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
            isPassword && showToggle ? 'pe-10' : '',
            className,
          ].join(' ')}
          {...props}
        />

        {/* Doc 05 §5 checklist: icons switch outline→filled on active state
            rather than just changing color — the eye/eye-slash swap here is
            that pattern applied to a toggle rather than a nav item. */}
        {isPassword && showToggle && (
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
