import { XIcon } from 'phosphor-react-native';
import { Modal, Pressable, useWindowDimensions } from 'react-native';
import { Image, View } from 'tamagui';

/**
 * apps/mobile/src/components/ui/ImageViewer.tsx
 *
 * Phase 25 — journal.tsx's detail sheet previously showed a photo at a
 * fixed 240px height with no way to see it larger — the Phase 23/24 UI
 * audit flagged this as "tapping a thumbnail does nothing" (referring to
 * the list thumbnails specifically, which already opened the detail sheet;
 * the real gap was that the detail sheet's own photo had no further
 * zoom/full-screen affordance either). This adds a full-screen black-
 * backdrop viewer, tap-anywhere-to-dismiss, opened from a tap on the
 * detail sheet's photo.
 *
 * Pinch-to-zoom deliberately deferred (noted in the audit doc as a fair v2
 * cut) — this is a straightforward Modal + contained Image, no new
 * dependency beyond what's already installed.
 */
interface ImageViewerProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

export function ImageViewer({ visible, uri, onClose }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();

  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' }}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer l'image"
      >
        <Image source={{ uri }} width={width} height={height} resizeMode="contain" />
        <View
          position="absolute"
          top={52}
          right={20}
          width={40}
          height={40}
          borderRadius={20}
          backgroundColor="rgba(255,255,255,0.15)"
          alignItems="center"
          justifyContent="center"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        >
          <XIcon size={20} color="#FFFFFF" weight="bold" />
        </View>
      </Pressable>
    </Modal>
  );
}
