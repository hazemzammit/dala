import { loginSchema } from '@dala/validation';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { supabase } from '@/lib/supabase';

/**
 * Doc 03 §3.1 / Doc 01 §1.3.5 — Login. Same validation schema and same
 * backend as the web login screen — this is the concrete "one product, two
 * surfaces" mechanism, not just a claim (Doc 00 §0.4).
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.replace('/dashboard');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Se connecter
      </Text>

      <FormField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />

      {error && <Text color="$danger">{error}</Text>}

      <Button onPress={handleSubmit} loading={loading}>
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
