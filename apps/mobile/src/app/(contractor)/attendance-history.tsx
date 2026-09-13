import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AttendanceHistory } from '@/components/attendance/AttendanceHistory';

/**
 * apps/mobile/src/app/(contractor)/attendance-history.tsx
 *
 * IMPROVEMENT-PLAN PHASE 6 (§1.1 step 2) — thin screen wrapper around
 * `AttendanceHistory` (see that component's own header for the design
 * choice). Reachable from `pointage.tsx`'s header icon — a header
 * button/icon is enough per the plan's own wording, no redesign of the
 * daily-toggle screen's layout. No `workerId` passed here — this is the
 * org-wide entry point; `worker/[id].tsx`'s Pointage tab renders the same
 * `AttendanceHistory` component directly, filtered, without this wrapper.
 */
export default function AttendanceHistoryScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack
        alignItems="center"
        gap="$3"
        paddingTop="$4"
        paddingHorizontal="$4"
        paddingBottom="$3"
      >
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={22} color={color.neutral[900]} />
        </XStack>
        <Text fontFamily="$display" fontSize={18} fontWeight="600">
          Historique de pointage
        </Text>
      </XStack>
      <YStack flex={1} paddingHorizontal="$4">
        <AttendanceHistory />
      </YStack>
    </YStack>
  );
}
