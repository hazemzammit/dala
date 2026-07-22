import { color } from '@dala/design-tokens';
import { XIcon } from 'phosphor-react-native';
import { Modal, Pressable } from 'react-native';
import { ScrollView, Text, View, XStack, YStack } from 'tamagui';

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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(17,19,24,0.4)' }} onPress={onClose} />
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
            <XIcon size={20} color={color.neutral[500]} />
          </View>
        </XStack>

        <Body>{children}</Body>
      </YStack>
    </Modal>
  );
}
