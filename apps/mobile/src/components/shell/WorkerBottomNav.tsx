import { color } from '@dala/design-tokens';
import { usePathname, router } from 'expo-router';
import { GearIcon, HouseIcon, WalletIcon, type Icon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

/**
 * apps/mobile/src/components/shell/WorkerBottomNav.tsx
 *
 * Doc 05 §2.4 — the worker app's shell is deliberately NOT the contractor's
 * BottomNav: 3 items only (Accueil / Salaire / Réglages), no FAB, no "Plus"
 * sheet. "Resist adding anything else here; complexity creep on the worker
 * app defeats its whole design premise." Do not import/reuse the contractor
 * BottomNav for this — it's a separate component on purpose, not a
 * parameterized variant of the same one, so a future contractor-nav change
 * can't accidentally leak complexity into the worker shell.
 */
const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: '/(worker)/home', label: 'Accueil', icon: HouseIcon },
  { href: '/(worker)/salary', label: 'Salaire', icon: WalletIcon },
  { href: '/(worker)/settings', label: 'Réglages', icon: GearIcon },
];

export function WorkerBottomNav() {
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
            paddingHorizontal="$4"
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
    </XStack>
  );
}
