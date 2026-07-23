import { BuildingsIcon, PlusIcon } from 'phosphor-react-native';
import { YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Placeholder — full screen spec in
 * docs/spec/03-screens-mobile-contractor-and-worker.md §3.10.
 * FAB: "New chantier" per Doc 05 §2.1.
 */
export default function ProjectsScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <EmptyState
        icon={BuildingsIcon}
        illustration="under-construction"
        title="Aucun chantier pour le moment"
        description="Créez votre premier chantier pour commencer à suivre budget, équipe et avancement. Utilisez le bouton + ci-dessous."
      />
      <FAB icon={PlusIcon} accessibilityLabel="Nouveau chantier" onPress={() => {}} />
    </YStack>
  );
}
