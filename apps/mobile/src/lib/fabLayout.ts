import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * apps/mobile/src/lib/fabLayout.ts
 *
 * Doc 05 §1.7l — "The reserved space is a formula, not a hardcoded pixel
 * value." Confirmed live defect (Phase 17 audit): on Advances, the FAB
 * visually overlaps the "Marquer comme payé" button's label, because
 * `FAB.tsx` hardcoded `bottom={96}` with no safe-area awareness, and
 * `advances.tsx`'s ScrollView hardcoded `paddingBottom: 140` — less than
 * the FAB's own footprint (56 diameter + 96 offset = 152) even before
 * accounting for the device's safe-area inset, which is exactly the "fixes
 * one device, silently reintroduces the same defect on any device with a
 * different safe-area inset" failure mode the spec describes.
 *
 *   bottomContentInset = FAB diameter + FAB bottom offset + safeAreaBottom
 *                         + breathing-room margin
 *
 * FAB_DIAMETER and FAB_BOTTOM_OFFSET are the same two numbers FAB.tsx
 * already used (56, 96) — kept here as the single source of truth so the
 * FAB's own position and any screen's reserved scroll padding can never
 * drift apart. FAB_BOTTOM_OFFSET already clears the app's `BottomNav`
 * (which sits at `position: absolute; bottom: 0` under the FAB) — this
 * primitive adds the two things that offset never accounted for:
 * `insets.bottom` (the actual device safe-area inset, 0 on most Android
 * phones, ~34pt on iPhones with a home indicator) and a fixed breathing-
 * room margin so content doesn't hug the FAB's edge.
 */
export const FAB_DIAMETER = 56;
export const FAB_BOTTOM_OFFSET = 96;
export const FAB_BREATHING_ROOM = 16;

/**
 * The FAB's own `bottom` position, safe-area aware. Use this (not a raw
 * `96`) anywhere a FAB is positioned, so it never sits inside the system
 * gesture area on devices with a taller safe-area inset.
 */
export function useFabBottomOffset(): number {
  const insets = useSafeAreaInsets();
  return FAB_BOTTOM_OFFSET + insets.bottom;
}

/**
 * The minimum bottom padding any scrollable list beneath a FAB must
 * reserve, per §1.7l's formula. Pass the result directly as a
 * ScrollView/FlatList's `contentContainerStyle.paddingBottom` (or
 * equivalent) instead of a hardcoded number.
 */
export function useFabBottomContentInset(): number {
  const insets = useSafeAreaInsets();
  return FAB_DIAMETER + FAB_BOTTOM_OFFSET + insets.bottom + FAB_BREATHING_ROOM;
}
