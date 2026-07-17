import { color } from '@dala/design-tokens';
import { usePathname, router } from 'expo-router';
import {
  BuildingsIcon,
  DotsThreeIcon,
  HardHatIcon,
  HouseIcon,
  TruckIcon,
  type Icon,
} from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';


/**
 * apps/mobile/src/components/shell/BottomNav.tsx
 *
 * Doc 05 §2.1 — "4–5 items max... group into Accueil / Chantiers / Dispatch
 * / Équipe / Plus, with 'Plus' opening a sheet listing everything else."
 * Active item: filled icon + accent-600 label. Inactive: outline icon +
 * neutral-500 label. Icon + label always (no text-only tabs).
 *
 * Deliberately NOT built on expo-router's <Tabs> navigator — a plain
 * pathname-driven bar gives full control over the active-icon-weight swap
 * and the "Plus opens a sheet instead of navigating" behavior without
 * fighting the Tabs abstraction for a 5th non-navigating item.
 */
const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: '/dashboard', label: 'Accueil', icon: HouseIcon },
  { href: '/projects', label: 'Chantiers', icon: BuildingsIcon },
  { href: '/dispatch', label: 'Dispatch', icon: TruckIcon },
  { href: '/team', label: 'Équipe', icon: HardHatIcon },
];

interface BottomNavProps {
  onPlusPress: () => void;
}

export function BottomNav({ onPlusPress }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <XStack
      position="absolute"
      bottom={0}
      left={0}
      right={0}
      backgroundColor="$neutral0"
      borderTopWidth={1}
      borderTopColor="$neutral100"
      paddingBottom={20}
      paddingTop={8}
      justifyContent="space-around"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        const TabIcon = tab.icon;
        return (
          <YStack
            key={tab.href}
            alignItems="center"
            gap={2}
            onPress={() => router.push(tab.href as never)}
            paddingHorizontal="$2"
          >
            <TabIcon
              size={22}
              weight={active ? 'fill' : 'regular'}
              color={active ? color.accent[600] : color.neutral[500]}
            />
            <Text
              fontSize={11}
              color={active ? '$accent600' : '$neutral500'}
              fontWeight={active ? '600' : '400'}
            >
              {tab.label}
            </Text>
          </YStack>
        );
      })}

      <YStack alignItems="center" gap={2} onPress={onPlusPress} paddingHorizontal="$2">
        <DotsThreeIcon size={22} weight="regular" color={color.neutral[500]} />
        <Text fontSize={11} color="$neutral500">
          Plus
        </Text>
      </YStack>
    </XStack>
  );
}
