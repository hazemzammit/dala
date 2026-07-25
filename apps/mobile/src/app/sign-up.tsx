import { signUpSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { PasswordStrengthMeter } from '@/components/ui/PasswordStrengthMeter';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

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

        <Button onPress={handleSubmit} loading={loading}>
          Créer mon compte
        </Button>

        <Text color="$neutral500" textAlign="center" onPress={() => router.replace('/login')}>
          Déjà un compte ? Se connecter
        </Text>
      </YStack>
    </ScrollView>
  );
}
