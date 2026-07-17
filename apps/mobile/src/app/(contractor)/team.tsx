import { HardHatIcon, PlusIcon } from 'phosphor-react-native';
import { YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Placeholder — full screen spec in
 * docs/spec/03-screens-mobile-contractor-and-worker.md §3.13.
 * FAB: "Invite worker" (analogous to web's "+ Inviter un membre").
 */
export default function TeamScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <EmptyState
        icon={HardHatIcon}
        title="Aucun ouvrier dans votre équipe"
        description="Invitez vos ouvriers pour suivre présence, avances et affectations."
      />
      <FAB icon={PlusIcon} accessibilityLabel="Inviter un ouvrier" onPress={() => {}} />
    </YStack>
  );
}
