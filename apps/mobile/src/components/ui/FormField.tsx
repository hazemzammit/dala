import { Eye, EyeSlash } from 'phosphor-react-native';
import { useState } from 'react';
import { Input, Text, View, XStack, YStack } from 'tamagui';
import type { GetProps } from 'tamagui';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/FormField.tsx
 *
 * Doc 05 §2.5 — "Field label above input (never placeholder-as-label —
 * placeholders disappear on focus and users lose context, especially on a
 * construction site with sun glare on the phone)."
 * Doc 05 §4 — FormField states: default, focused (accent border), error
 * (danger border + helper text), disabled.
 *
 * Web equivalent: apps/web/src/components/ui/FormField.tsx — keep both in
 * sync when changing either one. Dark-mode pass note: the mobile version's
 * password-visibility icon color now reads `useTokenColor()` instead of
 * `@dala/design-tokens`'s `color` directly, a mobile-only divergence from
 * the web twin (web's theming is a separate Tailwind-based system with no
 * corresponding "read a raw color value in JS" gap) — flagging this so the
 * next person syncing the two doesn't assume it's an oversight.
 */
type InputProps = GetProps<typeof Input>;

interface FormFieldProps extends Omit<InputProps, 'onChange'> {
  label: string;
  error?: string;
  secureTextEntry?: boolean;
}

export function FormField({ label, error, secureTextEntry, ...props }: FormFieldProps) {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const tc = useTokenColor();

  const borderColor = error ? '$danger' : focused ? '$accent600' : '$neutral300';

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="500" color="$neutral900">
        {label}
      </Text>

      <XStack alignItems="center" position="relative">
        <Input
          flex={1}
          borderRadius="$control"
          borderColor={borderColor}
          borderWidth={1}
          backgroundColor="$neutral0"
          paddingHorizontal={12}
          paddingVertical={10}
          fontSize={15.5}
          secureTextEntry={secureTextEntry && !showPassword}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...props}
        />

        {secureTextEntry && (
          <View
            position="absolute"
            right={12}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
            }
          >
            {showPassword ? (
              <EyeSlash size={18} color={tc.neutral500} weight="fill" />
            ) : (
              <Eye size={18} color={tc.neutral500} />
            )}
          </View>
        )}
      </XStack>

      {error && (
        <Text fontSize={13} color="$danger">
          {error}
        </Text>
      )}
    </YStack>
  );
}
