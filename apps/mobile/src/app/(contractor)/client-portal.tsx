import { HandshakeIcon } from 'phosphor-react-native';
import { YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';

/** Placeholder — full screen spec in docs/spec/03-screens-mobile-contractor-and-worker.md. */
export default function Screen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <EmptyState
        icon={HandshakeIcon}
        title="Aucun client connecté"
        description="Invitez vos clients à suivre l'avancement de leur chantier."
      />
    </YStack>
  );
}
