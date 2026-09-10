'use client';

/**
 * apps/web/src/components/ui/Switch.tsx
 *
 * No toggle/switch primitive existed anywhere in apps/web before this —
 * confirmed by searching for `role="switch"` and `type="checkbox"` project-
 * wide (the only checkbox usages are DataTable's row-selection checkboxes,
 * a different control). Added here since notification-settings (§1.3) is
 * the first screen that needs one; a plain checkbox reads wrong for "on/off
 * preference," which is what mobile's own `Toggle` component is used for.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-accent-600' : 'bg-neutral-300'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
