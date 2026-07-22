import { Slot } from 'expo-router';
import { YStack } from 'tamagui';

import { WorkerBottomNav } from '@/components/shell/WorkerBottomNav';

/**
 * apps/mobile/src/app/(worker)/_layout.tsx
 *
 * Doc 03 §4 / Doc 05 §2.4 — the worker app's shell, entirely separate from
 * `(contractor)/_layout.tsx`. No FAB, no Plus sheet — just the 3-item
 * WorkerBottomNav. index.tsx routes a session here only after confirming
 * the account is a linked `workers` row, not an organization member.
 */
export default function WorkerLayout() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <Slot />
      <WorkerBottomNav />
    </YStack>
  );
}
