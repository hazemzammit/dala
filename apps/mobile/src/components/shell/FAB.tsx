import { color } from '@dala/design-tokens';
import type { Icon } from 'phosphor-react-native';
import { View } from 'tamagui';

/**
 * apps/mobile/src/components/shell/FAB.tsx
 *
 * Doc 05 §2.1 — "single circular filled accent-600 button, floating above
 * the bottom nav, contextual per screen... Never more than one FAB action
 * visible."
 */
interface FABProps {
  icon: Icon;
  onPress: () => void;
  accessibilityLabel: string;
}

export function FAB({ icon: IconComponent, onPress, accessibilityLabel }: FABProps) {
  return (
    <View
      position="absolute"
      bottom={96}
      right={20}
      width={56}
      height={56}
      borderRadius={28}
      backgroundColor="$accent600"
      alignItems="center"
      justifyContent="center"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      shadowColor="#000"
      shadowOpacity={0.15}
      shadowRadius={10}
      shadowOffset={{ width: 0, height: 4 }}
      // @ts-expect-error — `elevation` is RN's Android shadow prop; Tamagui's View
      // style types don't declare it, but it's still forwarded to the native View
      // at runtime, so this keeps the Android shadow rather than dropping it.
      elevation={4}
    >
      <IconComponent size={24} color={color.neutral[0]} weight="bold" />
    </View>
  );
}
