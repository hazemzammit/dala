import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Text, YStack } from 'tamagui';

import { WELCOME_SEEN_KEY } from './welcome';

import { checkAppVersion } from '@/lib/appVersion';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/index.tsx
 *
 * Doc 03 §3.1 — Splash. Two checks run before any routing decision:
 *   1. Version check (Doc 01 §1.8) — if the build is below
 *      min_supported_version, stop entirely and show Forced Update (§3.1a),
 *      regardless of session validity. Fails OPEN on a network error (see
 *      lib/appVersion.ts) — never blocks a legitimate offline-first user.
 *   2. Session check — routes to Home, "Check your email," Welcome, or
 *      Login per §3.1's table.
 *
 * Contractor vs. worker routing: a session alone doesn't say which shell to
 * land in, since both roles share one login. This checks
 * organization_members first (contractor) and falls back to the workers
 * table (worker) — not explicitly laid out as a single routing table
 * anywhere in Doc 03, but is the necessary consequence of §3.9 (contractor
 * Home) and §4.1 (Worker Home) being two different route groups fed by the
 * same login screen.
 */
export default function Index() {
  useEffect(() => {
    void resolve();
  }, []);

  async function resolve() {
    const version = await checkAppVersion();
    if (version.forceUpdate) {
      router.replace('/forced-update');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      const welcomeSeen = await SecureStore.getItemAsync(WELCOME_SEEN_KEY);
      router.replace(welcomeSeen ? '/login' : '/welcome');
      return;
    }

    // Doc 03 §3.1's "email_verified_at NULL → Check your email" branch.
    const { data: profile } = await supabase
      .from('profiles')
      .select('email_verified_at')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile && !profile.email_verified_at) {
      router.replace('/check-email');
      return;
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      router.replace('/dashboard');
      return;
    }

    const { data: worker } = await supabase
      .from('workers')
      .select('id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle();

    if (worker) {
      router.replace('/(worker)/home');
      return;
    }

    // Session valid but neither a contractor nor a linked worker — shouldn't
    // happen in practice (every account is created via sign-up or
    // accept-worker-invitation, both of which create the matching row), but
    // fail toward Login rather than a blank screen if it ever does.
    router.replace('/login');
  }

  return (
    <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$neutral25">
      <Text fontFamily="$display" fontSize={28} fontWeight="700">
        Dala
      </Text>
      <Text color="$neutral500" marginTop="$2">
        La base de tout chantier.
      </Text>
    </YStack>
  );
}
