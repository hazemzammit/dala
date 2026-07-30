import { loginSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * Doc 03 §3.1 / Doc 01 §1.3.5 — Login. Same validation schema and same
 * backend as the web login screen — this is the concrete "one product, two
 * surfaces" mechanism, not just a claim (Doc 00 §0.4).
 *
 * Phase 4 addition — optional `next` param. accept-org-invite.tsx's
 * existing-account path ("J'ai déjà un compte") routes here with
 * `next=/accept-org-invite` (and the token still attached) rather than
 * hardcoding a return path, so this screen doesn't need to know anything
 * about the invite flow specifically — just "is there somewhere other than
 * Dashboard I was asked to go back to."
 */
export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (authError) {
      setError(authError.message);
      haptics.error();
      return;
    }

    // Phase 8 — Doc 01 §1.15. Supabase issues a valid session immediately
    // regardless of enrolled TOTP factors (see migration 0029's header for
    // why that's by design, not a gap) — checking currentLevel vs.
    // nextLevel is how the client knows a challenge is still pending
    // before letting the person past this screen.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      router.replace({
        pathname: '/mfa-challenge' as never,
        params: { next: (next as string) ?? '/dashboard' },
      });
      return;
    }

    router.replace((next as never) ?? '/dashboard');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Se connecter
      </Text>

      <FormField
        testID="login-email-input"
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField
        testID="login-password-input"
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error && <Text color="$danger">{error}</Text>}

      <Button testID="login-submit-button" onPress={handleSubmit} loading={loading}>
        Se connecter
      </Button>

      <YStack flexDirection="row" justifyContent="space-between">
        <Text color="$neutral500" onPress={() => router.push('/forgot-password')}>
          Mot de passe oublié ?
        </Text>
        <Text color="$neutral500" onPress={() => router.push('/sign-up')}>
          Créer un compte
        </Text>
      </YStack>
    </YStack>
  );
}
