import { passwordSchema } from '@dala/validation';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

const newPasswordSchema = z.object({ new_password: passwordSchema });

/**
 * Reached from auth/confirm.tsx after verifyOtp() already established the
 * recovery session — same division of responsibility as the web version.
 *
 * IMPROVEMENT-PLAN Part A — `lock-open` Icon3D added above the title. The
 * guide describes this as the icon for "new password set," implying a
 * post-submit confirmation moment — there isn't one: `handleSubmit` on
 * success goes straight to `router.replace('/login')` with no confirmation
 * screen or toast in between. Building that moment is new UX, not icon
 * wiring, so it's out of scope here; the icon is placed on the form itself
 * instead, same treatment as mfa-challenge.tsx/mfa-recover.tsx.
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
      haptics.error();
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.new_password,
    });

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      haptics.error();
      return;
    }

    await supabase.rpc('mark_latest_password_reset_completed');

    setLoading(false);
    router.replace('/login');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <YStack alignItems="center">
        <Icon3D name="lock-open" />
      </YStack>
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Choisir un nouveau mot de passe
      </Text>

      <YStack>
        <FormField
          label="Nouveau mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <PasswordStrengthMeter password={password} />
      </YStack>

      {error && <Text color="$danger">{error}</Text>}

      <Button onPress={handleSubmit} loading={loading}>
        Enregistrer
      </Button>
    </YStack>
  );
}
