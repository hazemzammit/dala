import { color } from '@dala/design-tokens';
import { LockIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';

import { useCanSeeMoney } from '@/lib/useCanSeeMoney';

/**
 * Wraps a money screen (advances, expenses, analytics, reports). Viewers
 * (Observateur) are money-blind (migration 0103): they get an explanation
 * instead of a screen full of empty lists and "0 TND". `children` is only
 * mounted for owners/managers, so a blocked screen never runs its queries.
 * Presentation only — RLS is the boundary.
 */
export function MoneyGate({ title, children }: { title: string; children: ReactNode }) {
  const { loading, canSeeMoney } = useCanSeeMoney();
  if (loading) return null;
  if (canSeeMoney) return <>{children}</>;
  return (
    <YStack flex={1} alignItems="center" justifyContent="center" padding={32} gap="$3">
      <LockIcon size={40} color={color.neutral[400]} />
      <Text fontSize={18} fontWeight="700" color="$neutral900" textAlign="center">
        {title}
      </Text>
      <Text fontSize={14} color="$neutral600" textAlign="center">
        Les informations financières (paie, avances, dépenses, facturation) sont réservées aux
        propriétaires et aux gestionnaires. Votre rôle d’observateur donne accès aux opérations
        uniquement.
      </Text>
    </YStack>
  );
}
