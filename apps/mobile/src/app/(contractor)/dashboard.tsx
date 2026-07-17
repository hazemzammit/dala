import { Text, YStack } from 'tamagui';

/**
 * Doc 03 §3.9 — Home/Dashboard. Placeholder; replace with the real
 * single-column stat-card layout (mobile keeps single-column per Doc 00
 * §0.4, unlike web's denser multi-widget grid).
 */
export default function DashboardScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25" padding="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Bonjour 👋
      </Text>
    </YStack>
  );
}
