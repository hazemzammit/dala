import { organizationMemberSetPasswordSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Illustration } from '@/components/ui/Illustration';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/accept-organization-invite.tsx
 *
 * Doc 03 §3.22 — org-member invite accept flow (migration 0030). Reached
 * via a deep link (`dala://accept-organization-invite?token=...`, per
 * app.json's `scheme: "dala"`), same as accept-invite.tsx / accept-org-
 * invite.tsx.
 *
 * Three-way branch, same shape as accept-org-invite.tsx (chosen over
 * accept-invite.tsx's simpler always-new-account shape) because an invited
 * org member plausibly already has a Dala account — this product's core
 * decision is unlimited-orgs-per-account (Doc 00 §0.5):
 *
 *   - Already logged in            → accept directly via the
 *                                     accept_organization_member_invitation
 *                                     RPC (checks the session's email
 *                                     matches the invited address).
 *   - Not logged in, has an account → "Se connecter", carrying `next=
 *                                     /accept-organization-invite?token=...`
 *                                     so login.tsx returns here afterward.
 *   - Not logged in, no account yet → an inline password form on THIS
 *                                     screen (unlike accept-org-invite.tsx,
 *                                     which navigates to sign-up.tsx) —
 *                                     there's no organization-name/trade
 *                                     to collect here, the org already
 *                                     exists, so a full sign-up form would
 *                                     ask for things that don't apply.
 *                                     Submits to the new
 *                                     accept-organization-invitation Edge
 *                                     Function, mirroring accept-invite.tsx's
 *                                     accept-worker-invitation call.
 *
 * No lookup tries to guess which of the last two applies — same reasoning
 * as get_project_invitation_by_token (0024): resolving an email to
 * account-existence for an anonymous caller is its own leak. The person
 * picks.
 */
type LoadState = 'loading' | 'ready' | 'expired' | 'already_accepted' | 'not_found' | 'accepted';
type UnauthMode = 'choice' | 'create-account';

export default function AcceptOrganizationInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [orgName, setOrgName] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'viewer'>('viewer');

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [unauthMode, setUnauthMode] = useState<UnauthMode>('choice');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadInvitation();
  }, [token]);

  async function loadInvitation() {
    if (!token) {
      setLoadState('not_found');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setIsLoggedIn(!!session);

    const { data, error: rpcError } = await supabase.rpc(
      'get_organization_member_invitation_by_token',
      { p_token: token },
    );

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

    setOrgName(data.organization_name);
    setInvitedEmail(data.invited_email);
    setRole(data.role);
    setLoadState('ready');
  }

  async function handleAcceptAsCurrentUser() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('accept_organization_member_invitation', {
        p_token: token,
      });
      if (rpcError) {
        haptics.error();
        if (rpcError.message?.includes('email_mismatch')) {
          setError(
            `Cette invitation a été envoyée à ${invitedEmail}. Connectez-vous avec ce compte pour l’accepter.`,
          );
        } else {
          setError('Impossible d’accepter cette invitation. Réessayez.');
        }
        return;
      }
      haptics.confirm();
      setLoadState('accepted');
    } finally {
      setSubmitting(false);
    }
  }

  function goToLogin() {
    router.push({
      pathname: '/login',
      params: { next: `/accept-organization-invite?token=${token}` },
    });
  }

  async function handleCreateAccount() {
    setError(null);
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      haptics.error();
      return;
    }

    const parsed = organizationMemberSetPasswordSchema.safeParse({
      invitation_token: token,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'accept-organization-invitation',
        { body: parsed.data, headers: { 'x-dala-platform': 'mobile' } },
      );

      if (fnError || data?.error) {
        const code = data?.error;
        haptics.error();
        if (code === 'already_accepted') {
          setLoadState('already_accepted');
        } else if (code === 'expired') {
          setLoadState('expired');
        } else if (code === 'account_exists') {
          setError('Un compte existe déjà avec cet e-mail. Connectez-vous plutôt.');
          setUnauthMode('choice');
        } else {
          setError(code ?? 'Une erreur est survenue. Réessayez.');
        }
        return;
      }

      // Same email the account was created with — sign in directly, no
      // separate confirmation step (this screen's header explains why).
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
      router.replace('/(contractor)/dashboard');
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
          Ce lien n&apos;est pas valide. Demandez au propriétaire de l&apos;organisation de vous en
          envoyer un nouveau.
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
          Cette invitation a expiré. Demandez-en une nouvelle.
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
          Invitation déjà acceptée
        </Text>
        <Text color="$neutral500" textAlign="center">
          Connectez-vous pour accéder à cette organisation.
        </Text>
        <Button onPress={() => router.replace('/login')}>Aller à la connexion</Button>
      </YStack>
    );
  }

  if (loadState === 'accepted') {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
        <YStack alignItems="center">
          <Illustration name="confirmed" size={170} />
        </YStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600" textAlign="center">
          Vous avez rejoint {orgName}
        </Text>
        <Button onPress={() => router.replace('/(contractor)/dashboard')}>
          Aller au tableau de bord
        </Button>
      </YStack>
    );
  }

  if (isLoggedIn) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
        <Text fontFamily="$display" fontSize={22} fontWeight="600" textAlign="center">
          {orgName} vous invite en tant que {role === 'manager' ? 'manager' : 'observateur'}
        </Text>
        {error && (
          <Text color="$danger" textAlign="center">
            {error}
          </Text>
        )}
        <Button onPress={handleAcceptAsCurrentUser} loading={submitting}>
          Accepter l&apos;invitation
        </Button>
      </YStack>
    );
  }

  if (unauthMode === 'create-account') {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
        <Text fontFamily="$display" fontSize={22} fontWeight="600" textAlign="center">
          Bienvenue chez {orgName}
        </Text>

        <FormField label="E-mail" value={invitedEmail} editable={false} />

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

        <Button onPress={handleCreateAccount} loading={submitting}>
          Créer mon compte
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={22} fontWeight="600" textAlign="center">
        {orgName} vous invite en tant que {role === 'manager' ? 'manager' : 'observateur'}
      </Text>
      <Text color="$neutral500" textAlign="center">
        Invitation envoyée à {invitedEmail}
      </Text>

      {error && (
        <Text color="$danger" textAlign="center">
          {error}
        </Text>
      )}

      <YStack gap="$3">
        <Button onPress={goToLogin}>J&apos;ai déjà un compte</Button>
        <Button variant="secondary" onPress={() => setUnauthMode('create-account')}>
          Créer un compte
        </Button>
      </YStack>
    </YStack>
  );
}
