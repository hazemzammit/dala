import { router } from 'expo-router';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';

/** Doc 01 §1.3.3 step 5-6 — see the web equivalent's comment for the
 *  read-only-until-verified reasoning; same applies here. */
export default function CheckEmailScreen() {
  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Vérifiez votre e-mail
      </Text>
      <Text color="$neutral500">
        Nous avons envoyé un lien de confirmation. Cliquez dessus pour activer toutes les
        fonctionnalités de votre compte.
      </Text>
      <Button onPress={() => router.replace('/dashboard')}>
        Continuer vers le tableau de bord
      </Button>
    </YStack>
  );
}
