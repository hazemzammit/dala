import { Slot } from 'expo-router';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { BottomNav } from '@/components/shell/BottomNav';
import { PlusSheet } from '@/components/shell/PlusSheet';

/**
 * apps/mobile/src/app/(contractor)/_layout.tsx
 *
 * Doc 05 §2.1 — persistent bottom nav across every authenticated contractor
 * screen. Each screen renders its own FAB directly (contextual per screen,
 * per spec — "New dispatch on Dispatch, New chantier on Projects") rather
 * than this layout owning a single shared FAB.
 */
export default function ContractorLayout() {
  const [plusSheetVisible, setPlusSheetVisible] = useState(false);

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <Slot />
      <BottomNav onPlusPress={() => setPlusSheetVisible(true)} />
      <PlusSheet visible={plusSheetVisible} onClose={() => setPlusSheetVisible(false)} />
    </YStack>
  );
}
