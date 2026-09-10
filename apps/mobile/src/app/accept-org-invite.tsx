import type { OrganizationLegalForm, OrganizationVerificationStatus } from '@dala/shared-types';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { OrgIdentityRow } from '@/components/organizations/OrgIdentityRow';
import { Button } from '@/components/ui/Button';
import { Illustration } from '@/components/ui/Illustration';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/accept-org-invite.tsx
 *
 * Doc 02 §2.8 — org-to-org invite accept flow. Reached via deep link
 * (`dala://accept-org-invite?token=...`, per app.json's scheme). Uses the
 * anon-safe `get_project_invitation_by_token` RPC (migration 0024) to
 * resolve the token before any session exists, same pattern as
 * accept-invite.tsx / get_worker_invitation_by_token.
 *
 * Deliberately DIFFERENT from accept-invite.tsx past that point, per Doc 02
 * §2.8's explicit requirement: a worker invite creates the account directly
 * (accept-worker-invitation Edge Function, no separate email verification —
 * the invite link itself is the identity proof). An org invite must NOT do
 * that — "it doesn't bypass sign-up, it just pre-fills organization
 * context." So there is no set-password form on this screen at all. Instead
 * it branches three ways once the invitation resolves:
 *
 *   - Already logged in            → accept directly via the
 *                                     accept_project_invitation RPC.
 *   - Not logged in, has an account → "Se connecter", carrying `next=
 *                                     /accept-org-invite?token=...` so
 *                                     login.tsx returns here afterward.
 *   - Not logged in, no account yet → "Créer un compte", to sign-up.tsx
 *                                     with trade_type/project_name/
 *                                     lead_org_name prefilled and the token
 *                                     carried through to the Edge Function.
 *
 * No lookup tries to guess which of the last two applies — see
 * get_project_invitation_by_token's own comment on why that would leak
 * account-existence for a phone/email pair. The person picks.
 *
 * Org-creation-guide/gaps follow-on (migration 0079) — the inviting org's
 * FULL identity (logo/trade_type/legal_form/verification_status, not just
 * its name) is now shown here too, via the same reusable OrgIdentityRow
 * collaboration.tsx uses. This was a deliberate decision (Hazem, not
 * assumed): showing an anonymous, no-account-yet visitor this much about
 * another org is a materially different exposure question than an
 * already-authenticated screen, so it's its own migration
 * (0079_invite_lead_org_full_identity.sql) rather than silently reusing
 * 0078's narrower default reasoning.
 *
 * Widened again in migration 0082 to add facebook_url/instagram_url/
 * website_url (shown as a small row of links below OrgIdentityRow) — these
 * had been write-only since 0075 despite that migration's own framing of
 * Facebook/Instagram as more important than a website for these
 * businesses; see 0082's header for the full reasoning.
 */
type LoadState = 'loading' | 'ready' | 'expired' | 'already_accepted' | 'not_found' | 'accepted';

interface LeadOrgIdentity {
  name: string;
  logoSignedUrl: string | null;
  tradeType: string | null;
  legalForm: OrganizationLegalForm | null;
  verificationStatus: OrganizationVerificationStatus | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

export default function AcceptOrgInviteScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [projectName, setProjectName] = useState('');
  const [leadOrg, setLeadOrg] = useState<LeadOrgIdentity>({
    name: '',
    logoSignedUrl: null,
    tradeType: null,
    legalForm: null,
    verificationStatus: null,
    facebookUrl: null,
    instagramUrl: null,
    websiteUrl: null,
  });
  const [tradeType, setTradeType] = useState<string | null>(null);

  const [budgetRollup, setBudgetRollup] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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

    const { data, error: rpcError } = await supabase.rpc('get_project_invitation_by_token', {
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

    setProjectName(data.project_name);
    setLeadOrg({
      name: data.lead_org_name,
      logoSignedUrl: data.lead_org_logo_signed_url ?? null,
      tradeType: data.lead_org_trade_type ?? null,
      legalForm: data.lead_org_legal_form ?? null,
      verificationStatus: data.lead_org_verification_status ?? null,
      facebookUrl: data.lead_org_facebook_url ?? null,
      instagramUrl: data.lead_org_instagram_url ?? null,
      websiteUrl: data.lead_org_website_url ?? null,
    });
    setTradeType(data.trade_type ?? null);
    setLoadState('ready');
  }

  async function handleAcceptAsCurrentOrg() {
    setError(null);
    setSubmitting(true);
    try {
      const { error: rpcError } = await supabase.rpc('accept_project_invitation', {
        p_token: token,
        p_budget_rollup_opt_in: budgetRollup,
      });
      if (rpcError) throw rpcError;

      haptics.confirm();
      setLoadState('accepted');
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  }

  function goToLogin() {
    router.push({
      pathname: '/login',
      params: { next: `/accept-org-invite?token=${token}` },
    });
  }

  function goToSignUp() {
    router.push({
      pathname: '/sign-up',
      params: {
        org_invite_token: token,
        trade_type: tradeType ?? '',
        project_name: projectName,
        lead_org_name: leadOrg.name,
        org_invite_budget_rollup_opt_in: String(budgetRollup),
      },
    });
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
          Ce lien n&apos;est pas valide. Demandez à l&apos;entreprise qui vous a invité de vous en
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
          Cette invitation a expiré. Demandez une nouvelle invitation.
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
          Ce chantier a déjà été rejoint. Connectez-vous pour y accéder.
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
          Vous avez rejoint « {projectName} »
        </Text>
        <Button onPress={() => router.replace('/(contractor)/collaboration')}>
          Voir la collaboration
        </Button>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <YStack alignItems="center">
        <OrgIdentityRow
          name={leadOrg.name}
          logoSignedUrl={leadOrg.logoSignedUrl}
          tradeType={leadOrg.tradeType}
          legalForm={leadOrg.legalForm}
          verificationStatus={leadOrg.verificationStatus}
        />
        {(leadOrg.websiteUrl || leadOrg.facebookUrl || leadOrg.instagramUrl) && (
          <XStack gap="$3" marginTop="$2">
            {leadOrg.websiteUrl && (
              <Text
                fontSize={13}
                color="$accent600"
                onPress={() => Linking.openURL(leadOrg.websiteUrl!)}
              >
                Site web
              </Text>
            )}
            {leadOrg.facebookUrl && (
              <Text
                fontSize={13}
                color="$accent600"
                onPress={() => Linking.openURL(leadOrg.facebookUrl!)}
              >
                Facebook
              </Text>
            )}
            {leadOrg.instagramUrl && (
              <Text
                fontSize={13}
                color="$accent600"
                onPress={() => Linking.openURL(leadOrg.instagramUrl!)}
              >
                Instagram
              </Text>
            )}
          </XStack>
        )}
      </YStack>
      <Text fontFamily="$display" fontSize={22} fontWeight="600" textAlign="center">
        {leadOrg.name} vous invite sur « {projectName} »
      </Text>
      {tradeType && (
        <Text color="$neutral500" textAlign="center">
          Métier : {tradeType}
        </Text>
      )}

      <XStack
        alignItems="center"
        justifyContent="space-between"
        backgroundColor="$neutral0"
        borderRadius="$card"
        padding="$4"
      >
        <YStack flex={1} paddingEnd="$3">
          <Text fontSize={14.5} fontWeight="500">
            Partager mon budget consommé avec {leadOrg.name} pour ce chantier
          </Text>
          <Text fontSize={12.5} color="$neutral500" marginTop="$1">
            {leadOrg.name} verra un pourcentage agrégé, jamais le détail de vos dépenses. Désactivé
            par défaut, modifiable à tout moment.
          </Text>
        </YStack>
        <Switch value={budgetRollup} onValueChange={setBudgetRollup} />
      </XStack>

      {error && (
        <Text color="$danger" textAlign="center">
          {error}
        </Text>
      )}

      {isLoggedIn ? (
        <Button onPress={handleAcceptAsCurrentOrg} loading={submitting}>
          Accepter l&apos;invitation
        </Button>
      ) : (
        <YStack gap="$3">
          <Button onPress={goToLogin}>J&apos;ai déjà un compte</Button>
          <Button variant="secondary" onPress={goToSignUp}>
            Créer un compte
          </Button>
        </YStack>
      )}
    </YStack>
  );
}
