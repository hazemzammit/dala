import { Slot } from 'expo-router';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { BottomNav } from '@/components/shell/BottomNav';
import { PlusSheet } from '@/components/shell/PlusSheet';
import { PastDueBanner } from '@/components/ui/PastDueBanner';

/**
 * apps/mobile/src/app/(contractor)/_layout.tsx
 *
 * Doc 05 §2.1 — persistent bottom nav across every authenticated contractor
 * screen. Each screen renders its own FAB directly (contextual per screen,
 * per spec — "New dispatch on Dispatch, New chantier on Projects") rather
 * than this layout owning a single shared FAB.
 *
 * PHASE 22 — `PastDueBanner` mounted here, not in the root layout, since
 * it's a contractor/org-billing concept with no equivalent on the worker
 * side (Doc 03 §4.6 — worker settings has no org/billing section at all).
 * Placed above `<Slot />` for the same reason `OfflineBanner` sits above
 * the root `<Stack />`: pushes content down rather than floating over it,
 * so it never covers a screen's own header controls.
 */
export default function ContractorLayout() {
  const [plusSheetVisible, setPlusSheetVisible] = useState(false);

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <PastDueBanner />
      <Slot />
      <BottomNav onPlusPress={() => setPlusSheetVisible(true)} />
      <PlusSheet visible={plusSheetVisible} onClose={() => setPlusSheetVisible(false)} />
    </YStack>
  );
}
