import { PlusIcon, TruckIcon } from 'phosphor-react-native';
import { YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Placeholder — full screen spec in
 * docs/spec/03-screens-mobile-contractor-and-worker.md §3.11.
 * FAB: "New dispatch" per Doc 05 §2.1.
 */
export default function DispatchScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <EmptyState
        icon={TruckIcon}
        title="Aucun dispatch aujourd'hui"
        description="Assignez des ouvriers et véhicules aux chantiers du jour."
      />
      <FAB icon={PlusIcon} accessibilityLabel="Nouveau dispatch" onPress={() => {}} />
    </YStack>
  );
}
