import { workerSetPasswordSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/accept-invite.tsx
 *
 * Doc 03 §3.8 — worker-specific onboarding path. Reached via a deep link
 * (`dala://accept-invite?token=...`, per app.json's `scheme: "dala"`) sent
 * to the worker's email, with a WhatsApp/SMS courtesy copy carrying the same
 * link. Calls the new `accept-worker-invitation` Edge Function (service-role,
 * same reasoning as sign-up: no session exists yet to act under RLS), then
 * signs in client-side with the password just set — no separate
 * email-verification gate, the invite channel is the identity proof.
 *
 * Uses the anon-safe `get_worker_invitation_by_token` RPC (migration 0017)
 * to resolve the token into a read-only name/email/org display before the
 * account exists.
 */
type LoadState = 'loading' | 'ready' | 'expired' | 'already_accepted' | 'not_found';

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [workerName, setWorkerName] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [orgName, setOrgName] = useState('');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void loadInvitation();
  }, [token]);

  async function loadInvitation() {
    if (!token) {
      setLoadState('not_found');
      return;
    }
    const { data, error: rpcError } = await supabase.rpc('get_worker_invitation_by_token', {
      p_token: token,
    });

    if (rpcError || !data) {
      setLoadState('not_found');
      return;
    }
    if (data.status === 'accepted') {
      setLoadState('already_accepted');
      return;
    }
    if (data.expired) {
      setLoadState('expired');
      return;
    }

    setWorkerName(data.worker_full_name);
    setWorkerEmail(data.worker_email ?? '');
    setOrgName(data.organization_name);
    setLoadState('ready');
  }

  async function handleSubmit() {
    setError(null);
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    const parsed = workerSetPasswordSchema.safeParse({ invitation_token: token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('accept-worker-invitation', {
        body: parsed.data,
        headers: { 'x-dala-platform': 'mobile' },
      });

      if (fnError || data?.error) {
        const code = data?.error;
        if (code === 'already_accepted') {
          setLoadState('already_accepted');
        } else if (code === 'expired') {
          setLoadState('expired');
        } else {
          setError(code ?? 'Une erreur est survenue. Réessayez.');
        }
        return;
      }

      // Same email the account was created with — sign in directly, no
      // separate confirmation step (file header explains why).
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (signInError) {
        setError(
          'Compte créé, mais la connexion automatique a échoué. Connectez-vous manuellement.',
        );
        router.replace('/login');
        return;
      }

      router.replace('/(worker)/home');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <YStack flex={1} backgroundColor="$neutral25" alignItems="center" justifyContent="center">
        <Text color="$neutral500">Chargement…</Text>
      </YStack>
    );
  }

  if (loadState === 'not_found') {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$3">
        <Text fontFamily="$display" fontSize={20} fontWeight="600" textAlign="center">
          Invitation introuvable
        </Text>
        <Text color="$neutral500" textAlign="center">
          Ce lien n&apos;est pas valide. Demandez à votre responsable de vous en envoyer un nouveau.
        </Text>
      </YStack>
    );
  }

  if (loadState === 'expired') {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$3">
        <Text fontFamily="$display" fontSize={20} fontWeight="600" textAlign="center">
          Invitation expirée
        </Text>
        <Text color="$neutral500" textAlign="center">
          Cette invitation a expiré. Demandez à votre responsable de vous en envoyer une nouvelle.
        </Text>
      </YStack>
    );
  }

  if (loadState === 'already_accepted') {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
        <Text fontFamily="$display" fontSize={20} fontWeight="600" textAlign="center">
          Compte déjà activé
        </Text>
        <Text color="$neutral500" textAlign="center">
          Ce compte existe déjà. Connectez-vous avec votre e-mail et votre mot de passe.
        </Text>
        <Button onPress={() => router.replace('/login')}>Aller à la connexion</Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Bienvenue chez {orgName}
      </Text>

      <FormField label="Nom" value={workerName} editable={false} />
      <FormField label="E-mail" value={workerEmail} editable={false} />

      <YStack>
        <FormField
          label="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Au moins 10 caractères"
        />
        <PasswordStrengthMeter password={password} />
      </YStack>

      <FormField
        label="Confirmer le mot de passe"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
      />

      {error && <Text color="$danger">{error}</Text>}

      <Button onPress={handleSubmit} loading={submitting}>
        Activer mon compte
      </Button>
    </YStack>
  );
}
