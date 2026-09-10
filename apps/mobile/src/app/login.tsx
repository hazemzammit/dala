import { loginSchema } from '@dala/validation';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * Doc 03 §3.1 / Doc 01 §1.3.5 — Login. Same validation schema and same
 * backend as the web login screen — this is the concrete "one product, two
 * surfaces" mechanism, not just a claim (Doc 00 §0.4).
 *
 * Phase 4 addition — optional `next` param. accept-org-invite.tsx's
 * existing-account path ("J'ai déjà un compte") routes here with
 * `next=/accept-org-invite` (and the token still attached) rather than
 * hardcoding a return path, so this screen doesn't need to know anything
 * about the invite flow specifically — just "is there somewhere other than
 * Dashboard I was asked to go back to."
 *
 * Org-creation-guide addition — post-login completion redirect. Since
 * sign-up.tsx stays intentionally minimal (name/trade_type only — see
 * create-organization.tsx's own header), a fresh account's org profile is
 * usually incomplete on first login. Rather than hook this to the sign-up
 * confirmation link (which, per the sign-up Edge Function's own comment,
 * always opens a WEB url — apps/web's /auth/confirm — regardless of
 * platform, so a mobile signup's confirmation tap never actually returns
 * to this app), this checks at the one place a mobile session is reliably
 * (re)established: right here, after signInWithPassword succeeds. Gated on
 * the SAME `org_checklist_dismissed_at` flag organization-settings.tsx's
 * own banner already uses (via `dismiss_org_checklist`), not a second,
 * separate "have we nagged this person" flag — so dismissing the banner
 * there also stops this redirect, and vice versa isn't possible to
 * diverge. Only applies when there's no explicit `next` destination
 * already requested (e.g. accept-org-invite's flow) — never overrides an
 * intentional deep link.
 *
 * Migration 0083 — a suspended account (org- or user-level) is now
 * rejected at sign-in by the check_suspension_before_token_issuance auth
 * hook, which raises an exception containing the marker
 * 'DALA_ACCOUNT_SUSPENDED'. authError.message is matched against that
 * marker below rather than assumed to equal it exactly, since GoTrue's
 * exact wrapping of a hook-raised exception message isn't confirmed
 * against a live instance in this sandbox (0083's own header discloses
 * this); falls back to showing the raw error message if the marker
 * doesn't survive whatever wrapping is actually applied, so the person
 * always sees SOME error, never silence.
 */
// Same 5-field completion check organization-settings.tsx's own banner
// computes (logo, legal_form, workforce_size_bracket, service_area,
// matricule_fiscal) — kept in sync by being the same literal list, not a
// shared constant, since duplicating five field names is cheaper here than
// introducing a cross-screen import for something this small; if that list
// ever changes it needs updating in both places, same as any other
// UI-level constant duplicated for a single call site.
async function getIncompleteOrgRedirect(): Promise<string | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select(
      'logo_url, legal_form, workforce_size_bracket, service_area, matricule_fiscal, org_checklist_dismissed_at',
    )
    .eq('id', orgId)
    .maybeSingle();
  if (!org || org.org_checklist_dismissed_at) return null;

  const checks = [
    !!org.logo_url,
    !!org.legal_form,
    !!org.workforce_size_bracket,
    !!org.service_area?.trim(),
    !!org.matricule_fiscal?.trim(),
  ];
  const completion = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  if (completion >= 100) return null;

  return `/create-organization?org_id=${orgId}`;
}

export default function LoginScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (authError) {
      setError(
        authError.message.includes('DALA_ACCOUNT_SUSPENDED')
          ? 'Ce compte (ou votre entreprise) a été suspendu par un administrateur. Contactez votre responsable.'
          : authError.message,
      );
      haptics.error();
      return;
    }

    // Phase 8 — Doc 01 §1.15. Supabase issues a valid session immediately
    // regardless of enrolled TOTP factors (see migration 0029's header for
    // why that's by design, not a gap) — checking currentLevel vs.
    // nextLevel is how the client knows a challenge is still pending
    // before letting the person past this screen.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.nextLevel !== aal.currentLevel) {
      router.replace({
        pathname: '/mfa-challenge' as never,
        params: { next: (next as string) ?? '/dashboard' },
      });
      return;
    }

    if (!next) {
      const redirect = await getIncompleteOrgRedirect();
      if (redirect) {
        router.replace(redirect as never);
        return;
      }
    }

    router.replace((next as never) ?? '/dashboard');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" padding="$4" gap="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Se connecter
      </Text>

      <FormField
        testID="login-email-input"
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <FormField
        testID="login-password-input"
        label="Mot de passe"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {error && <Text color="$danger">{error}</Text>}

      <Button testID="login-submit-button" onPress={handleSubmit} loading={loading}>
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
