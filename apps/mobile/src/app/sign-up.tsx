import { signUpSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Logo } from '@/components/ui/Logo';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { Toggle } from '@/components/ui/Toggle';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * Phase 12 (improvement-plan §10.5) — FINDING: `signUpSchema` (validated
 * above in `handleSubmit`) has no privacy-consent field, and no privacy-
 * policy checkbox or link existed anywhere on this screen before this
 * phase — confirmed by reading this file in full before writing anything.
 * Both app stores require a privacy policy to be presented before/at
 * account creation for an app that collects personal data (this one
 * collects phone numbers, photos, financial data — see
 * docs/PRIVACY_POLICY.md, this same phase). Added as a client-side gate
 * only (the `Button` below stays disabled until checked) — NOT wired into
 * `signUpSchema`/the `sign-up` Edge Function, since changing that shared
 * validation schema is a larger, cross-cutting change (it's also used by
 * `accept-org-invite.tsx`'s own flow) that deserves its own review rather
 * than being folded into this phase's document-writing scope. Flagged in
 * PHASE_12_BRIEF.md as a disclosed, deliberate partial fix: the UI gate
 * is real and effective for this screen, but a determined API caller
 * bypassing the app entirely could still hit `sign-up` without ever
 * having agreed — closing that fully is server-side schema work, not
 * done here.
 *
 * Logo (2026-09-30) — Doc 03 §3.3 specifies "single scrollable form, `Dala`
 * logo at top, form fields..." and the logo had never been rendered (no
 * screen in apps/mobile imported a logo asset before this — `src/assets`
 * held only `icons-3d/` and `illustrations/`). Rendered through the shared
 * `components/ui/Logo.tsx`, the same component login.tsx now uses, so the
 * two screens can't drift apart on the brand mark.
 */
const PRIVACY_POLICY_URL = 'https://dala.tn/confidentialite';

/**
 * Doc 01 §1.3.3 — same Edge Function as web (supabase/functions/sign-up),
 * for the same reason: org + owner-membership creation can't happen
 * client-side under RLS before email confirmation. See the function's own
 * header comment.
 *
 * Phase 4 (Doc 02 §2.8) addition — org_invite_token/trade_type/
 * project_name/lead_org_name route params. Set only when this screen was
 * reached from accept-org-invite.tsx's "Créer un compte" button for a
 * contact with no existing account. Per Doc 02 §2.8: "the invite doubles as
 * an onboarding link into the standard sign-up flow... it must NOT bypass
 * password-based account creation" — this is still the exact same form,
 * same schema, same email-verification requirement as an ordinary sign-up.
 * The only two things an invite changes: the trade_type field starts
 * pre-filled, and a banner names which chantier/lead org they're about to
 * join. Everything else the person types themselves, including the
 * organization name — pre-filling that would presume a name on their
 * behalf, which isn't what "pre-fills organization CONTEXT" asked for.
 */
export default function SignUpScreen() {
  const params = useLocalSearchParams<{
    org_invite_token?: string;
    trade_type?: string;
    project_name?: string;
    lead_org_name?: string;
    org_invite_budget_rollup_opt_in?: string;
  }>();
  const inviteToken = params.org_invite_token;

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    organization_name: '',
    trade_type: params.trade_type ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    setError(null);
    const parsed = signUpSchema.safeParse({
      ...form,
      org_invite_token: inviteToken || undefined,
      // Already shown and answered on accept-org-invite.tsx before the
      // person ever reached this screen — carried through as a route
      // param (necessarily a string, since expo-router params are always
      // strings) rather than re-asked here.
      org_invite_budget_rollup_opt_in: inviteToken
        ? params.org_invite_budget_rollup_opt_in === 'true'
        : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setLoading(true);
    const { data, error: fnError } = await supabase.functions.invoke('sign-up', {
      body: parsed.data,
      headers: { 'x-dala-platform': 'mobile' },
    });
    setLoading(false);

    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Impossible de créer le compte.');
      haptics.error();
      return;
    }

    router.replace('/check-email');
  }

  return (
    <ScrollView backgroundColor="$neutral25">
      <YStack padding="$4" gap="$4">
        {/* Doc 03 §3.3 — "`Dala` logo at top". Shared Logo component, same
            sizing as login.tsx (see Logo.tsx / login.tsx's header for the
            web-parity reasoning). */}
        <Logo />

        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Créer votre compte
        </Text>

        {inviteToken && params.project_name && (
          <YStack backgroundColor="$accent50" borderRadius="$card" padding="$3">
            <Text fontSize={13.5} color="$accent600">
              Vous rejoignez « {params.project_name} »
              {params.lead_org_name ? ` avec ${params.lead_org_name}` : ''} une fois votre compte
              créé et confirmé.
            </Text>
          </YStack>
        )}

        <FormField
          label="Nom complet"
          value={form.full_name}
          onChangeText={(v) => update('full_name', v)}
        />
        <FormField
          label="E-mail"
          value={form.email}
          onChangeText={(v) => update('email', v)}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <FormField
          label="Téléphone"
          value={form.phone}
          onChangeText={(v) => update('phone', v)}
          keyboardType="phone-pad"
        />

        <YStack>
          <FormField
            label="Mot de passe"
            value={form.password}
            onChangeText={(v) => update('password', v)}
            secureTextEntry
          />
          <PasswordStrengthMeter password={form.password} />
        </YStack>

        <FormField
          label="Nom de l'entreprise"
          value={form.organization_name}
          onChangeText={(v) => update('organization_name', v)}
        />
        <FormField
          label="Type d'activité (optionnel)"
          value={form.trade_type}
          onChangeText={(v) => update('trade_type', v)}
        />

        {error && <Text color="$danger">{error}</Text>}

        {/* Phase 12 (improvement-plan §10.5) — see this file's own header
            for why this is a client-side gate, not a schema change. */}
        <XStack alignItems="center" gap="$2.5">
          <Toggle
            value={privacyAccepted}
            onChange={setPrivacyAccepted}
            accessibilityLabel="J'accepte la politique de confidentialité"
          />
          <Text
            flex={1}
            fontSize={13}
            color="$neutral500"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          >
            J&apos;accepte la{' '}
            <Text color="$accent600" textDecorationLine="underline">
              politique de confidentialité
            </Text>
            .
          </Text>
        </XStack>

        <Button onPress={handleSubmit} loading={loading} disabled={!privacyAccepted}>
          Créer mon compte
        </Button>

        <Text color="$neutral500" textAlign="center" onPress={() => router.replace('/login')}>
          Déjà un compte ? Se connecter
        </Text>
      </YStack>
    </ScrollView>
  );
}
