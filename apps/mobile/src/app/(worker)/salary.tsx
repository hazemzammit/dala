import { WalletIcon } from 'phosphor-react-native';
import { YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';

/**
 * apps/mobile/src/app/(worker)/salary.tsx
 *
 * Doc 03 §4.5 — full day-by-day cycle breakdown is Phase 2 (Doc 02 §2.10,
 * scheduled alongside contractor advances/payroll). Deliberately left as a
 * stub rather than building it now — WorkerBottomNav needs a real route to
 * point at, but the day-by-day table + payment-status badge is out of
 * Phase 1's scope; don't scope-creep it in here.
 */
export default function WorkerSalaryScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <EmptyState
        icon={WalletIcon}
        title="Détail du salaire"
        description="Le détail jour par jour de votre cycle arrive dans une prochaine mise à jour."
      />
    </YStack>
  );
}
