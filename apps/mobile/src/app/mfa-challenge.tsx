import { totpCodeSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/mfa-challenge.tsx
 *
 * Phase 8 — Doc 01 §1.15. Reached from login.tsx when
 * getAuthenticatorAssuranceLevel() reports a pending aal2 challenge (a TOTP
 * factor is enrolled). Lists the user's verified TOTP factor, opens a
 * challenge, and verifies the 6-digit code — success elevates the session
 * to aal2 and navigation continues to wherever login was headed.
 *
 * IMPROVEMENT-PLAN Part A — `shield-lock` Icon3D added above the title.
 * This screen had zero icon of any kind before (confirmed — nothing here
 * imported an icon), despite being the app's actual 2FA code-entry moment.
 */
export default function MfaChallengeScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function handleVerify() {
    setError(null);
    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Code invalide.');
      return;
    }

    setVerifying(true);

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    const totpFactor = factorsData?.totp?.[0];
    if (factorsError || !totpFactor) {
      setVerifying(false);
      setError('Aucun facteur de vérification trouvé.');
      return;
    }

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: totpFactor.id,
    });
    if (challengeError || !challengeData) {
      setVerifying(false);
      setError('Impossible de démarrer la vérification.');
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challengeData.id,
      code: parsed.data.code,
    });
    setVerifying(false);

    if (verifyError) {
      setError('Code incorrect.');
      haptics.error();
      return;
    }

    haptics.confirm();
    router.replace((next as never) ?? '/dashboard');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <YStack alignItems="center">
        <Icon3D name="shield-lock" />
      </YStack>
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Vérification en deux étapes
      </Text>
      <Text fontSize={14} color="$neutral500">
        Entrez le code à 6 chiffres généré par votre application d'authentification.
      </Text>

      <FormField
        testID="mfa-challenge-code-input"
        label="Code à 6 chiffres"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
      />

      {error && <Text color="$danger">{error}</Text>}

      <Button
        testID="mfa-challenge-verify-button"
        onPress={() => void handleVerify()}
        loading={verifying}
      >
        Vérifier
      </Button>

      <Text
        color="$accent600"
        fontWeight="600"
        textAlign="center"
        onPress={() => router.push({ pathname: '/mfa-recover' as never, params: { next } })}
      >
        Je n'ai plus accès à mon application d'authentification
      </Text>
    </YStack>
  );
}
