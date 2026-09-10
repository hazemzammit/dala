import { color as tokenColor } from '@dala/design-tokens';
import type { Icon } from 'phosphor-react-native';
import { Spinner, styled, Text, XStack } from 'tamagui';
import type { GetProps } from 'tamagui';

import { useReducedMotion } from '@/lib/useReducedMotion';

/**
 * apps/mobile/src/components/ui/Button.tsx
 *
 * Doc 05 §4 — PrimaryButton: default, pressed, disabled, loading (inline
 * spinner replaces label, button width doesn't jump). "Full-width on mobile
 * forms" (Doc 05 §4) is the default here — pass fullWidth={false} for the
 * rare auto-width case.
 *
 * Web equivalent: apps/web/src/components/ui/Button.tsx — keep both in
 * sync when changing either one.
 */
const StyledButton = styled(XStack, {
  borderRadius: '$control',
  paddingVertical: 12,
  paddingHorizontal: 16,
  alignItems: 'center',
  justifyContent: 'center',
  animation: 'press',
  pressStyle: { opacity: 0.85, scale: 0.96 },

  variants: {
    variant: {
      primary: { backgroundColor: '$accent600' },
      secondary: {
        backgroundColor: '$neutral0',
        borderWidth: 1,
        borderColor: '$neutral300',
      },
      text: { backgroundColor: 'transparent', paddingHorizontal: 0 },
      /**
       * UI/UX pass (Round 2 audit, §1.1) — every "secondary action" link in
       * the app (Assigner, Vue semaine, Pointage, Voir tout, etc.) used the
       * `text` variant above, which has literally zero visual container —
       * indistinguishable from any other colored text on the screen. `chip`
       * is a small tinted pill (tinted bg + no border) that reads as
       * clearly tappable without competing with `primary` CTAs. Deliberately
       * NOT full button chrome (no border, compact padding) — it should
       * read as a lightweight secondary affordance, not a second button.
       */
      chip: {
        backgroundColor: '$accent50',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
      },
    },
    fullWidth: {
      true: { width: '100%' },
      false: { alignSelf: 'flex-start' },
    },
    /**
     * UI/UX pass (Avances & Paie audit) — `fullWidth` alone is binary
     * (100% or hug-content), which is why `advances.tsx` previously put
     * two `fullWidth` buttons in one row: there was no "share the row"
     * mode, so the only way to get two visually-substantial actions
     * side by side was to misuse `fullWidth` on both, and the second
     * button overflowed the card/screen. `shareRow` fills the gap — pass
     * `shareRow` on both buttons in a row (inside an `XStack gap`) to
     * split the row evenly instead. Prefer this over `fullWidth`
     * whenever a card has two co-equal actions; reserve `fullWidth` for
     * the single-action case (forms, sheets). Deliberately NOT named
     * `flex` — the underlying `XStack` already has a native numeric
     * `flex` style prop, and shadowing it with a same-named boolean
     * variant would be an ambiguous, hard-to-typecheck collision.
     */
    shareRow: {
      true: { flex: 1, width: undefined },
    },
    disabled: {
      true: { opacity: 0.6 },
    },
  } as const,

  defaultVariants: {
    variant: 'primary',
    fullWidth: true,
  },
});

const textColor: Record<string, string> = {
  primary: 'white',
  secondary: '$neutral900',
  text: '$accent600',
  chip: '$accent600',
};

// Phosphor's Icon `color` prop needs a real color value, not a Tamagui
// token string — textColor above works for Text because Tamagui resolves
// token strings there, but Icon doesn't go through that layer.
const iconColor: Record<string, string> = {
  primary: tokenColor.neutral[0],
  secondary: tokenColor.neutral[900],
  text: tokenColor.accent[600],
  chip: tokenColor.accent[600],
};

type ButtonProps = GetProps<typeof StyledButton> & {
  loading?: boolean;
  onPress?: () => void;
  children: string;
  /** Rendered before the label — e.g. the worker check-in state-machine
   * button, so a state change reads as icon+label together, not text alone. */
  icon?: Icon;
};

export function Button({
  loading,
  disabled,
  children,
  variant = 'primary',
  icon: IconComponent,
  ...props
}: ButtonProps) {
  // Doc 05 §1.4b (Phase 19A) — reduced motion replaces the `press` spring
  // scale-down with a static opacity-only press state, no transform.
  const reducedMotion = useReducedMotion();

  return (
    <StyledButton
      variant={variant}
      disabled={disabled || loading}
      opacity={disabled || loading ? 0.6 : 1}
      gap="$2"
      animation={reducedMotion ? null : 'press'}
      pressStyle={reducedMotion ? { opacity: 0.7 } : { opacity: 0.85, scale: 0.96 }}
      {...props}
    >
      {loading ? (
        <Spinner color={variant === 'primary' ? 'white' : '$accent600'} />
      ) : (
        <>
          {IconComponent && (
            <IconComponent
              size={variant === 'chip' ? 14 : 18}
              weight="bold"
              color={iconColor[variant as string]}
            />
          )}
          <Text
            color={textColor[variant as string]}
            fontSize={variant === 'chip' ? 13 : 15.5}
            fontWeight={variant === 'chip' ? '600' : '500'}
          >
            {children}
          </Text>
        </>
      )}
    </StyledButton>
  );
}
