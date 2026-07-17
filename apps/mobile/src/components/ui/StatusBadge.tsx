import { color } from '@dala/design-tokens';
import { Text, View, XStack } from 'tamagui';


/**
 * apps/mobile/src/components/ui/StatusBadge.tsx
 *
 * Doc 05 §4 — rounded-full dot + label, row-level status. Web equivalent:
 * apps/web/src/components/ui/StatusBadge.tsx — keep both in sync.
 */
type StatusVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const SOLID: Record<StatusVariant, string> = {
  success: color.status.success,
  warning: color.status.warning,
  danger: color.status.danger,
  info: color.accent[600],
  neutral: color.neutral[500],
};

// Tamagui doesn't support Tailwind's "/10" alpha-suffix syntax on token
// strings — background tints are precomputed rgba() strings instead.
function toRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function StatusBadge({ variant, children }: { variant: StatusVariant; children: string }) {
  const solid = SOLID[variant];
  const background = variant === 'neutral' ? color.neutral[100] : toRgba(solid, 0.12);

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
