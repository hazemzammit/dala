import { Text } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * apps/mobile/src/components/ui/NumericText.tsx
 *
 * `@dala/design-tokens`' `typography.numericVariant` is `'tabular-nums'`
 * (Doc 05 §1) — "anywhere numbers stack in a column (salary tables, cost
 * columns)." Web gets this for free via the CSS `font-variant-numeric`
 * utility; React Native has no CSS variant string, so the equivalent is
 * the `fontVariant` style prop. This wraps that once so every stacked
 * numeric display (salary figures, cost columns, stat cards) uses the same
 * mechanism instead of each screen remembering the RN-specific prop name.
 *
 * Use for any Text where digits sit above/below other digits and need to
 * stay aligned — NOT for inline numbers in prose (a single count in a
 * sentence has nothing to misalign against).
 */
type TextProps = GetProps<typeof Text>;

export function NumericText({ style, ...props }: TextProps) {
  return <Text fontVariant={['tabular-nums']} style={style} {...props} />;
}
