import type { OrganizationLegalForm, OrganizationVerificationStatus } from '@dala/shared-types';
import { workerSetPasswordSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { OrgIdentityRow } from '@/components/organizations/OrgIdentityRow';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Illustration } from '@/components/ui/Illustration';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { haptics } from '@/lib/haptics';
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
 *
 * Widened in migration 0082 to show the same org-identity richness
 * (logo/trade_type/legal_form/verification_status/facebook_url/
 * instagram_url/website_url) that migration 0079 gave
 * accept-org-invite.tsx's org-to-org invite flow — applied here by parity
 * (a worker joining an org has at least as much reason to see who's
 * inviting them as a trade partner does), not a separately confirmed
 * product decision; see 0082's own header for that judgment call stated
 * plainly.
 */
type LoadState = 'loading' | 'ready' | 'expired' | 'already_accepted' | 'not_found';

interface OrgIdentity {
  name: string;
  logoSignedUrl: string | null;
  tradeType: string | null;
  legalForm: OrganizationLegalForm | null;
  verificationStatus: OrganizationVerificationStatus | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [workerName, setWorkerName] = useState('');
  const [workerEmail, setWorkerEmail] = useState('');
  const [org, setOrg] = useState<OrgIdentity>({
    name: '',
    logoSignedUrl: null,
    tradeType: null,
    legalForm: null,
    verificationStatus: null,
    facebookUrl: null,
    instagramUrl: null,
    websiteUrl: null,
  });

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
    setOrg({
      name: data.organization_name,
      logoSignedUrl: data.organization_logo_signed_url ?? null,
      tradeType: data.organization_trade_type ?? null,
      legalForm: data.organization_legal_form ?? null,
      verificationStatus: data.organization_verification_status ?? null,
      facebookUrl: data.organization_facebook_url ?? null,
      instagramUrl: data.organization_instagram_url ?? null,
      websiteUrl: data.organization_website_url ?? null,
    });
    setLoadState('ready');
  }

  async function handleSubmit() {
    setError(null);
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      haptics.error();
      return;
    }

    const parsed = workerSetPasswordSchema.safeParse({ invitation_token: token, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
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
        haptics.error();
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
        haptics.error();
        router.replace('/login');
        return;
      }

      haptics.confirm();
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
        <YStack alignItems="center" marginBottom="$2">
          <Illustration name="page-not-found" size={170} />
        </YStack>
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
        <YStack alignItems="center" marginBottom="$2">
          <Illustration name="alarm-clock" size={170} />
        </YStack>
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
        <YStack alignItems="center">
          <Illustration name="confirmed" size={170} />
        </YStack>
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
      <YStack alignItems="center" gap="$2">
        <OrgIdentityRow
          name={org.name}
          logoSignedUrl={org.logoSignedUrl}
          tradeType={org.tradeType}
          legalForm={org.legalForm}
          verificationStatus={org.verificationStatus}
        />
        {(org.websiteUrl || org.facebookUrl || org.instagramUrl) && (
          <XStack gap="$3">
            {org.websiteUrl && (
              <Text
                fontSize={13}
                color="$accent600"
                onPress={() => Linking.openURL(org.websiteUrl!)}
              >
                Site web
              </Text>
            )}
            {org.facebookUrl && (
              <Text
                fontSize={13}
                color="$accent600"
                onPress={() => Linking.openURL(org.facebookUrl!)}
              >
                Facebook
              </Text>
            )}
            {org.instagramUrl && (
              <Text
                fontSize={13}
                color="$accent600"
                onPress={() => Linking.openURL(org.instagramUrl!)}
              >
                Instagram
              </Text>
            )}
          </XStack>
        )}
      </YStack>
      <Text fontFamily="$display" fontSize={23} fontWeight="600" textAlign="center">
        Bienvenue chez {org.name}
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
