import { passwordSchema } from '@dala/validation';
import { router } from 'expo-router';
import { useState } from 'react';
import { Button, Input, Text, YStack } from 'tamagui';
import { z } from 'zod';

import { supabase } from '@/lib/supabase';

const newPasswordSchema = z.object({ new_password: passwordSchema });

/**
 * Reached from auth/confirm.tsx after verifyOtp() already established the
 * recovery session — same division of responsibility as the web version
 * (apps/web/src/app/(auth)/reset-password/page.tsx).
 */
export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = newPasswordSchema.safeParse({ new_password: password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Mot de passe invalide.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.new_password,
    });

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    await supabase.rpc('mark_latest_password_reset_completed');

    setLoading(false);
    router.replace('/login');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$3">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Choisir un nouveau mot de passe
      </Text>

      <Input
        placeholder="Nouveau mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error && <Text color="$danger">{error}</Text>}

      <Button onPress={handleSubmit} disabled={loading} backgroundColor="$accent600" color="white">
        {loading ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </YStack>
  );
}
