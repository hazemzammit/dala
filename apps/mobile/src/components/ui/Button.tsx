import { color as tokenColor } from '@dala/design-tokens';
import type { Icon } from 'phosphor-react-native';
import { Spinner, styled, Text, XStack } from 'tamagui';
import type { GetProps } from 'tamagui';

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
    },
    fullWidth: {
      true: { width: '100%' },
      false: { alignSelf: 'flex-start' },
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
};

// Phosphor's Icon `color` prop needs a real color value, not a Tamagui
// token string — textColor above works for Text because Tamagui resolves
// token strings there, but Icon doesn't go through that layer.
const iconColor: Record<string, string> = {
  primary: tokenColor.neutral[0],
  secondary: tokenColor.neutral[900],
  text: tokenColor.accent[600],
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
  return (
    <StyledButton
      variant={variant}
      disabled={disabled || loading}
      opacity={disabled || loading ? 0.6 : 1}
      gap="$2"
      {...props}
    >
      {loading ? (
        <Spinner color={variant === 'primary' ? 'white' : '$accent600'} />
      ) : (
        <>
          {IconComponent && (
            <IconComponent size={18} weight="bold" color={iconColor[variant as string]} />
          )}
          <Text color={textColor[variant as string]} fontSize={15.5} fontWeight="500">
            {children}
          </Text>
        </>
      )}
    </StyledButton>
  );
}
