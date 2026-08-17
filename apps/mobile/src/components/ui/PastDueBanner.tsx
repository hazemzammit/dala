import { router, usePathname } from 'expo-router';
import { WarningIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Text, XStack } from 'tamagui';

import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/components/ui/PastDueBanner.tsx
 *
 * Phase 22, Priority 8 — Doc 03 §3.21. Migration 0044 enforces a free-tier
 * cap server-side the moment `subscription_status = 'past_due'` (max 3
 * active projects, max 3 roster workers, no multi-org collaboration, no
 * Tier 0 insights — all raising `feature_requires_active_subscription`),
 * but until this phase nothing in the mobile app ever read
 * `subscription_status` at all (confirmed by grepping the app before
 * writing this — zero hits). The first a contractor would learn their org
 * was capped was a cryptic Postgres error surfacing from whichever action
 * they happened to attempt first. This closes that gap proactively.
 *
 * PATTERN: modeled directly on `OfflineBanner.tsx` — same "calm, persistent
 * strip, not a dialog or a toast" philosophy (Doc 01 §1.9's non-blocking
 * conflict-handling stance applies equally well here: a past-due org isn't
 * an error state to interrupt with a modal, it's an ongoing condition to
 * stay visible about). Unlike `OfflineBanner` (mounted in the root layout,
 * relevant to every account type), this is mounted in
 * `(contractor)/_layout.tsx` only — workers have no org/billing concept
 * (Doc 03 §4.6) and never see this.
 *
 * REFRESH STRATEGY, stated explicitly: this re-checks on every pathname
 * change (`usePathname()`), matching how every other org-scoped screen in
 * this app already refreshes itself — via its own screen-level
 * `useFocusEffect` triggered by navigation. A layout component wrapping
 * `<Slot />` has no equivalent per-screen focus event, so pathname change is
 * the closest available proxy for "the user navigated, worth re-checking."
 * KNOWN GAP, disclosed rather than silently accepted: switching orgs via
 * the dashboard's org-switcher pill does NOT itself change the pathname
 * (the switch happens without leaving `/dashboard`), so this banner can
 * lag by one screen if a contractor switches into a past-due org and stays
 * on Dashboard without navigating anywhere else. Wiring a real org-changed
 * event is a larger, cross-cutting change (activeOrg.ts has no event
 * emitter today) judged out of proportion to this one banner — flagged
 * here, not built silently around.
 */
export function PastDueBanner() {
  const pathname = usePathname();
  const [pastDue, setPastDue] = useState(false);
  const tc = useTokenColor();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const orgId = await getActiveOrgId();
      if (!orgId) {
        if (!cancelled) setPastDue(false);
        return;
      }
      const { data } = await supabase
        .from('organizations')
        .select('subscription_status')
        .eq('id', orgId)
        .maybeSingle();
      if (!cancelled) setPastDue(data?.subscription_status === 'past_due');
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (!pastDue) return null;

  return (
    <XStack
      // StatusBadge.tsx's own toRgba() helper precomputes the same 12%-alpha
      // tint for its "danger" variant — Tamagui has no "/10"-suffix alpha
      // syntax on token strings, so this repo's convention is a literal
      // rgba() rather than a token for any tinted (non-solid) danger surface.
      backgroundColor="rgba(192, 67, 61, 0.12)"
      paddingVertical={8}
      paddingHorizontal="$4"
      alignItems="center"
      justifyContent="center"
      gap="$2"
      onPress={() => router.push('/billing')}
      accessibilityRole="button"
      accessibilityLabel="Paiement en retard — voir la facturation"
    >
      <WarningIcon size={14} color={tc.danger} weight="fill" />
      <Text color={tc.danger} fontSize={12.5} fontWeight="500">
        Paiement en retard — certaines fonctionnalités sont limitées. Voir la facturation.
      </Text>
    </XStack>
  );
}
