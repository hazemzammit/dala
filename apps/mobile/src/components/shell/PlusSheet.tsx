import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import {
  CarIcon,
  ChartBarIcon,
  GearIcon,
  HandshakeIcon,
  ImageIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldWarningIcon,
  UsersThreeIcon,
  XIcon,
  type Icon,
} from 'phosphor-react-native';
import { Modal, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/shell/PlusSheet.tsx
 *
 * Doc 05 §2.1 — the rest of Doc 03's ~15 modules that don't fit in the
 * 5-item bottom nav. Plain React Native Modal rather than Tamagui's Sheet
 * component — fewer moving parts to get right for a first pass; swap for
 * Tamagui's Sheet later if the slide-up animation needs to feel nicer.
 */
const ITEMS: { href: string; label: string; icon: Icon }[] = [
  { href: '/vehicles', label: 'Véhicules', icon: CarIcon },
  { href: '/materials', label: 'Matériaux', icon: PackageIcon },
  { href: '/journal', label: 'Journal', icon: ImageIcon },
  { href: '/safety', label: 'Sécurité', icon: ShieldWarningIcon },
  { href: '/client-portal', label: 'Portail client', icon: HandshakeIcon },
  { href: '/collaboration', label: 'Collaboration', icon: UsersThreeIcon },
  { href: '/reports', label: 'Rapports', icon: ChartBarIcon },
  { href: '/billing', label: 'Facturation', icon: ReceiptIcon },
  { href: '/settings', label: 'Paramètres', icon: GearIcon },
];

interface PlusSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function PlusSheet({ visible, onClose }: PlusSheetProps) {
  function navigate(href: string) {
    onClose();
    router.push(href as never);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(17,19,24,0.4)' }} onPress={onClose} />
      <YStack
        backgroundColor="$neutral0"
        borderTopLeftRadius="$sheet"
        borderTopRightRadius="$sheet"
        paddingTop="$4"
        paddingBottom={40}
        paddingHorizontal="$4"
      >
        <XStack justifyContent="space-between" alignItems="center" marginBottom="$3">
          <Text fontFamily="$display" fontSize={18} fontWeight="600">
            Plus
          </Text>
          <XIcon size={20} color={color.neutral[500]} onPress={onClose} />
        </XStack>

        <YStack gap="$1">
          {ITEMS.map((item) => {
            const ItemIcon = item.icon;
            return (
              <XStack
                key={item.href}
                alignItems="center"
                gap="$3"
                paddingVertical={12}
                onPress={() => navigate(item.href)}
              >
                <ItemIcon size={20} color={color.neutral[900]} />
                <Text fontSize={15.5} color="$neutral900">
                  {item.label}
                </Text>
              </XStack>
            );
          })}
        </YStack>
      </YStack>
    </Modal>
  );
}
