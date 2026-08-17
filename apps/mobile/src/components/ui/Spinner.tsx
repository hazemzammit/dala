import { Spinner as TamaguiSpinner } from 'tamagui';

/**
 * apps/mobile/src/components/ui/Spinner.tsx
 *
 * `Button.tsx` already uses Tamagui's own `Spinner` inline for its loading
 * state — this wraps the same primitive for the non-button loading
 * contexts that don't have one today (pull-to-refresh header, an inline
 * row-level save, a full-screen loading fallback before a skeleton is
 * available). Kept to two sizes; this app's screens never need a third.
 */
interface SpinnerProps {
  size?: 'small' | 'large';
  color?: string;
}

export function Spinner({ size = 'small', color = '$accent600' }: SpinnerProps) {
  return <TamaguiSpinner size={size} color={color} />;
}
