import { Eye, EyeSlash } from 'phosphor-react-native';
import type { Icon } from 'phosphor-react-native';
import { useState } from 'react';
import { I18nManager } from 'react-native';
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
 *
 * Round 2 audit (§1.6, §1.12) — added an optional leading `icon` prop,
 * matching `DatePicker.tsx`'s own icon-row pattern (`tc.neutral500`, left
 * of the value/input) exactly, so a field's visual identity (pin for
 * address, coins for budget, user for client...) is the same mechanism
 * DatePicker already uses, not a new one-off.
 */
type InputProps = GetProps<typeof Input>;

interface FormFieldProps extends Omit<InputProps, 'onChange'> {
  label: string;
  error?: string;
  secureTextEntry?: boolean;
  /** Leading icon, rendered left of the input — same treatment as
   * `DatePicker`'s `CalendarIcon`. Optional; most fields don't need one. */
  icon?: Icon;
}

export function FormField({
  label,
  error,
  secureTextEntry,
  icon: IconComponent,
  ...props
}: FormFieldProps) {
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
        {/* Doc 05 RTL correction (Phase 19E, closing a gap 19D flagged and
            left unfixed): was a plain `left={12}` — `left`/`right` are
            always physical in React Native, unlike margin/padding, which
            have a genuine `Start`/`End` logical equivalent RN's style
            system resolves automatically. There's no such built-in
            equivalent for a raw absolute offset, so the prop-rename fix
            used everywhere else in 19D wasn't available here (19D's
            report named this as needing a different mechanism).
            Fixed with the standard RN pattern for exactly this case:
            branch on `I18nManager.isRTL` and set whichever physical side
            is currently the "start" edge. Kept the icon absolutely
            positioned inside the input (matching `DatePicker.tsx`'s
            same pattern, referenced in this file's header comment) so
            the LTR appearance is byte-identical to before this fix —
            only the icon's positioning MECHANISM changed, not its LTR
            position or the visual relationship to the input box. */}
        {IconComponent && (
          <View
            position="absolute"
            style={I18nManager.isRTL ? { right: 12 } : { left: 12 }}
            zIndex={1}
          >
            <IconComponent size={18} color={tc.neutral500} />
          </View>
        )}
        <Input
          flex={1}
          borderRadius="$control"
          borderColor={borderColor}
          borderWidth={1}
          backgroundColor="$neutral0"
          paddingHorizontal={12}
          paddingStart={IconComponent ? 38 : 12}
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
