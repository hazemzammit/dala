import { Text, View, XStack } from 'tamagui';

import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/StatusBadge.tsx
 *
 * Doc 05 §4 — rounded-full dot + label, row-level status. Web equivalent:
 * apps/web/src/components/ui/StatusBadge.tsx — keep both in sync.
 *
 * Dark-mode pass: `toRgba` used to be a local, duplicated helper — moved
 * to `lib/useTokenColor.ts` so `StatCard.tsx`/`Toast.tsx` share the same
 * implementation, and this component's solid/background colors now come
 * from `useTokenColor()` (theme-resolved) instead of `color.status.*`/
 * `color.accent[600]`/`color.neutral[...]` read directly (light-only).
 */
type StatusVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export function StatusBadge({ variant, children }: { variant: StatusVariant; children: string }) {
  const tc = useTokenColor();
  const colorByVariant: Record<StatusVariant, string> = {
    success: tc.success,
    warning: tc.warning,
    danger: tc.danger,
    info: tc.accent600,
    neutral: tc.neutral500,
  };
  const solid = colorByVariant[variant];
  const background = variant === 'neutral' ? tc.neutral100 : toRgba(solid, 0.12);

  return (
    <XStack
      alignItems="center"
      gap="$1.5"
      paddingHorizontal={10}
      paddingVertical={4}
      borderRadius={999}
      backgroundColor={background}
    >
      <View width={6} height={6} borderRadius={999} backgroundColor={solid} />
      <Text fontSize={12} fontWeight="500" color={solid}>
        {children}
      </Text>
    </XStack>
  );
}
