import { XIcon } from 'phosphor-react-native';
import { KeyboardAvoidingView, Modal, Platform, Pressable } from 'react-native';
import { ScrollView, Text, View, XStack, YStack } from 'tamagui';

import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/Sheet.tsx
 *
 * Generic bottom-sheet wrapper, factored out of the pattern already used by
 * PlusSheet — plain React Native Modal, not Tamagui's Sheet component (same
 * "fewer moving parts for a first pass" reasoning as PlusSheet's own
 * comment). Every new bottom sheet in Phase 1 (assign-worker, add-vehicle,
 * invite-worker, dispatch conflict-compare) uses this instead of
 * hand-rolling its own Modal, so the open/close/backdrop/scroll behavior
 * stays identical across all of them.
 *
 * PHASE 1 (improvement-plan §6.3) — checked keyboard handling on the
 * screens this pass touches (vehicles.tsx's add/edit form) and found zero
 * `KeyboardAvoidingView` usage anywhere `FormField` is used inside this
 * component, across every screen that opens a `Sheet` for a form — a form
 * with more than 1-2 fields, or opened on a smaller device, could have its
 * lower fields (and the submit `Button`, always the last child) sit behind
 * the open keyboard with no way to scroll them into view, since a RN
 * `Modal` renders in its own native window and isn't automatically pushed
 * up by the keyboard the way in-line content sometimes is.
 *
 * Fixed HERE, once, rather than per-screen — this component is the single
 * point every form sheet in the app already renders through (18+ call
 * sites), same "fix the one wrapper everything renders inside of" pattern
 * `app/_layout.tsx`'s own header uses for safe-area insets. `behavior`
 * differs by platform per RN's own documented guidance (`padding` on iOS,
 * `height` on Android — Android's default resize behavior handles most
 * cases but `height` avoids the sheet's `maxHeight="86%"` fighting the
 * resize). `keyboardVerticalOffset={0}` — the sheet itself isn't offset
 * from the screen edge the way a full-screen form under a header would be.
 */
interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  scroll?: boolean;
}

export function Sheet({ visible, onClose, title, children, scroll = true }: SheetProps) {
  const Body = scroll ? ScrollView : YStack;
  // Dark-mode pass — this icon color used to read the light-only
  // `color.neutral[500]` literal directly; `useTokenColor()` resolves the
  // ACTIVE theme's value instead, so the close button stays legible if
  // dark mode is ever turned on (see tamagui.config.ts's own comment).
  const tc = useTokenColor();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(17,19,24,0.4)' }} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <YStack
          backgroundColor="$neutral0"
          borderTopLeftRadius="$sheet"
          borderTopRightRadius="$sheet"
          maxHeight="86%"
          paddingTop="$4"
          paddingBottom={32}
          paddingHorizontal="$4"
        >
          <XStack justifyContent="space-between" alignItems="center" marginBottom="$3">
            <Text fontFamily="$display" fontSize={18} fontWeight="600">
              {title}
            </Text>
            <View onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer">
              <XIcon size={20} color={tc.neutral500} />
            </View>
          </XStack>

          <Body>{children}</Body>
        </YStack>
      </KeyboardAvoidingView>
    </Modal>
  );
}
