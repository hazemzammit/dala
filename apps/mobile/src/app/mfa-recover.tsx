import { mfaRecoverSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/mfa-recover.tsx
 *
 * Phase 8 — Doc 01 §1.15 lost-authenticator recovery. Re-asks for
 * email+password rather than threading the password through from
 * login.tsx via navigation params/state — deliberately not carrying a raw
 * password through router history for a flow only reached when someone
 * explicitly says they've lost their authenticator, a rare path worth the
 * one extra re-entry for the better security property.
 *
 * Calling the mfa-recover Edge Function DISABLES 2FA on the account (see
 * that function's header for why a recovery code can't just grant one-time
 * entry the way Supabase's own model works) — the copy on this screen says
 * so plainly before the person commits.
 */
export default function MfaRecoverScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRecover() {
    setError(null);
    const parsed = mfaRecoverSchema.safeParse({
      email: email.trim(),
      password,
      recovery_code: recoveryCode,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('mfa-recover', {
      body: parsed.data,
    });
    setBusy(false);

    if (fnError || (data as { error?: string } | null)?.error) {
      setError((data as { error?: string } | null)?.error ?? 'Impossible de récupérer le compte.');
      haptics.error();
      return;
    }

    const session = (data as { session?: { access_token: string; refresh_token: string } }).session;
    if (session) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }

    haptics.confirm();
    router.replace((next as never) ?? '/dashboard');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Récupérer l'accès
      </Text>
      <Text fontSize={14} color="$neutral500">
        Utilisez un de vos codes de récupération à 8 caractères. Cela désactivera la vérification en
        deux étapes sur votre compte — vous pourrez la réactiver ensuite depuis Sécurité.
      </Text>

      <FormField
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry />
      <FormField
        label="Code de récupération"
        value={recoveryCode}
        onChangeText={setRecoveryCode}
        autoCapitalize="characters"
      />

      {error && <Text color="$danger">{error}</Text>}

      <Button onPress={() => void handleRecover()} loading={busy}>
        Récupérer l'accès
      </Button>
    </YStack>
  );
}
