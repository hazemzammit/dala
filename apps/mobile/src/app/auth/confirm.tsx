import type { EmailOtpType } from '@supabase/supabase-js';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { supabase } from '@/lib/supabase';

/**
 * Doc 01 §1.3.3 / §1.3.7 — mobile counterpart of
 * apps/web/src/app/auth/confirm/route.ts. No cookies to manage here:
 * calling verifyOtp() with the mobile supabase-js client establishes the
 * session directly in SecureStore via the storage adapter configured in
 * lib/supabase.ts, so there's no server round-trip needed the way the web
 * route handler has one.
 *
 * Reached via the `dala://auth/confirm?token_hash=...&type=...` deep link
 * sent by the sign-up / forgot-password Edge Functions (mobile branch).
 */
export default function AuthConfirmScreen() {
  const { token_hash, type } = useLocalSearchParams<{
    token_hash?: string;
    type?: EmailOtpType;
  }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      if (!token_hash || !type) {
        setError('Lien invalide.');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      router.replace(type === 'recovery' ? '/reset-password' : '/dashboard');
    }

    verify();
  }, [token_hash, type]);

  return (
    <YStack
      flex={1}
      backgroundColor="$neutral25"
      justifyContent="center"
      alignItems="center"
      gap="$3"
    >
      {error ? (
        <>
          <Text color="$danger">{error}</Text>
          <Text color="$accent600" onPress={() => router.replace('/forgot-password')}>
            Demander un nouveau lien
          </Text>
        </>
      ) : (
        <Text color="$neutral500">Vérification…</Text>
      )}
    </YStack>
  );
}
