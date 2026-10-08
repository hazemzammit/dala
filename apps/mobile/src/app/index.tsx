import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Text, YStack } from 'tamagui';

import { WELCOME_SEEN_KEY } from './welcome';

import { Button } from '@/components/ui/Button';
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
 *
 * HARDENING (found by actually running the app, 2026-09-30) — this screen
 * used to have no timeout, no try/catch and no upper bound whatsoever: on a
 * device whose backend was unreachable-but-not-refusing (see
 * lib/fetchWithTimeout.ts's header for the full measurement), `resolve()`
 * below sat here for ~5 minutes while each awaited Supabase call timed out
 * in turn. Two changes now bound it: every individual request is capped
 * (fetchWithTimeout, wired once at the Supabase client in lib/supabase.ts),
 * and the whole sequence has its own deadline — after which `slow` renders
 * a notice + "Réessayer" instead of an indefinitely frozen-looking screen.
 * This is a deliberate, disclosed deviation from Doc 03 §3.1's "no
 * interactive elements": a splash nobody can get past is a worse failure
 * than two extra affordances, and they only appear once the backend has
 * failed to answer for BOOTSTRAP_DEADLINE_MS.
 */
const BOOTSTRAP_DEADLINE_MS = 15000;

export default function Index() {
  // Single navigation funnel — see `go()` below. A ref (not state) because
  // it must be readable synchronously from whichever async check finishes
  // first, without waiting for a re-render.
  const routed = useRef(false);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    routed.current = false;
    setSlow(false);

    // The deadline that makes this screen un-freezable. Added after the app
    // was caught sitting here for ~5 minutes on a device: every await below
    // used to be able to hang indefinitely (and `void resolve()` would have
    // swallowed a rejection silently), so the splash had no upper bound at
    // all. Now the screen always becomes actionable within
    // BOOTSTRAP_DEADLINE_MS, whatever the network is doing.
    const deadline = setTimeout(() => {
      if (!routed.current) setSlow(true);
    }, BOOTSTRAP_DEADLINE_MS);

    void resolve();
    return () => clearTimeout(deadline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  /**
   * Every route change on this screen goes through here — first caller
   * wins, and a late arrival from a slower check can never yank the person
   * to a second screen (the pre-existing code had five direct
   * `router.replace` calls and no such guard; it was safe only because each
   * branch returned early).
   */
  function go(path: string) {
    if (routed.current) return;
    routed.current = true;
    setSlow(false);
    router.replace(path as never);
  }

  async function resolve() {
    try {
      const version = await checkAppVersion();
      if (version.forceUpdate) {
        go('/forced-update');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const welcomeSeen = await SecureStore.getItemAsync(WELCOME_SEEN_KEY);
        go(welcomeSeen ? '/login' : '/welcome');
        return;
      }

      // Doc 03 §3.1's "email_verified_at NULL → Check your email" branch.
      const { data: profile } = await supabase
        .from('profiles')
        .select('email_verified_at')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profile && !profile.email_verified_at) {
        go('/check-email');
        return;
      }

      const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (membership) {
        go('/dashboard');
        return;
      }

      const { data: worker } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (worker) {
        go('/(worker)/home');
        return;
      }

      // Session valid but neither a contractor nor a linked worker — shouldn't
      // happen in practice (every account is created via sign-up or
      // accept-worker-invitation, both of which create the matching row), but
      // fail toward Login rather than a blank screen if it ever does.
      go('/login');
    } catch {
      // Safety net, same posture as the branch above: an unexpected throw
      // here (SecureStore/Keystore failure, a rejected promise from any of
      // the calls above) must never leave the app parked on the splash.
      // Deliberately silent rather than `toast.error` — this screen has no
      // ToastProvider above it yet (it renders before the root layout's
      // providers are usable for this route), and the Login screen the
      // person lands on reports real failures itself.
      go('/login');
    }
  }

  return (
    <YStack
      flex={1}
      alignItems="center"
      justifyContent="center"
      backgroundColor="$neutral25"
      paddingHorizontal="$4"
    >
      <Text fontFamily="$display" fontSize={28} fontWeight="700">
        Dala
      </Text>
      <Text color="$neutral500" marginTop="$2">
        La base de tout chantier.
      </Text>

      {/* Doc 03 §3.1's splash is otherwise static — this block is the
          escape hatch described in the header above, and it only exists
          once BOOTSTRAP_DEADLINE_MS has passed with no routing decision. */}
      {slow && (
        <>
          <Text color="$neutral500" fontSize={14} marginTop="$4" textAlign="center" maxWidth={300}>
            Le serveur met plus de temps que prévu à répondre. Vérifiez votre connexion, puis
            réessayez.
          </Text>
          <YStack marginTop="$4">
            <Button fullWidth={false} variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
              Réessayer
            </Button>
          </YStack>
          <Text
            color="$accent600"
            marginTop="$3"
            accessibilityRole="button"
            onPress={() => go('/login')}
          >
            Continuer vers la connexion
          </Text>
        </>
      )}
    </YStack>
  );
}
