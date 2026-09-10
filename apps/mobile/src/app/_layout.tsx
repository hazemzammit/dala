import { Sora_600SemiBold, Sora_700Bold, useFonts } from '@expo-google-fonts/sora';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TamaguiProvider, YStack } from 'tamagui';

import { AppLockGate } from '@/components/shell/AppLockGate';
import { AutoSync } from '@/components/shell/AutoSync';
import { ErrorBoundary } from '@/components/shell/ErrorBoundary';
import { GlobalErrorBridge } from '@/components/shell/GlobalErrorBridge';
import { NotificationRouter } from '@/components/shell/NotificationRouter';
import { OtaUpdateChecker } from '@/components/shell/OtaUpdateChecker';
import { AnnouncementBanner } from '@/components/ui/AnnouncementBanner';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ToastProvider } from '@/components/ui/Toast';
import { attachQueryClientAppStateListener, queryClient } from '@/lib/queryClient';
import { initSentry } from '@/lib/sentry';
import tamaguiConfig from '@/lib/tamagui.config';

// Phase 12 (improvement-plan §10.3) — called at module scope, the
// earliest point in this app's own code that runs. See lib/sentry.ts's
// own header for the disclosed limitation (a crash before expo-router's
// own bootstrap loads this module is still not covered) and why
// `Sentry.init()` had never been called anywhere before this phase.
initSentry();

/**
 * Doc 03 §3.1 — Splash checks app_version_check() before any session logic
 * runs (Doc 01 §1.8). Wired in index.tsx via lib/appVersion.ts, routing to
 * forced-update.tsx on a hard-block. This file stays the plain Stack shell —
 * all real routing/version logic lives in index.tsx, not here.
 *
 * defaultTheme="light" — without this, TamaguiProvider follows the device's
 * OS color scheme, so on any device/emulator with system dark mode on,
 * every themed Text's default `$color` resolves to the dark theme's light
 * foreground — while every screen's background comes from
 * @dala/design-tokens' neutral tokens, which are a single light-only
 * palette (Doc 05) and don't change with theme. That mismatch is exactly
 * "white text on a light background," and it isn't limited to whichever
 * screen you happen to notice it on — it silently affects every Text
 * anywhere in the app that doesn't set an explicit `color` prop. Since this
 * product has no designed dark mode at all, pinning the theme is the
 * correct fix, not a per-screen patch.
 *
 * UI/UX pass — the underlying gap that made pinning necessary is now fixed
 * at the source: `@dala/design-tokens`'s `dark` palette went from 3 keys to
 * a complete mirror of every custom color token any screen actually
 * references, and `tamagui.config.ts`'s new `themes` block wires those in
 * as a real swappable Tamagui theme (see that file's own comment for the
 * mechanism). So the specific bug this comment used to describe — our
 * custom tokens staying light-only while Tamagui's stock semantic tokens
 * followed the OS — no longer applies to `neutral*`/`accent*`/status
 * colors. `defaultTheme="light"` is kept here anyway, deliberately, rather
 * than switched to follow `useColorScheme()`: this app has ~16 component
 * files (icons, Chart/Sparkline's SVG elements) that read color values
 * directly from `@dala/design-tokens` in JS rather than through a Tamagui
 * token, which the theme swap can't reach (see tamagui.config.ts) — those
 * would still render light-mode-colored under a dark theme today. Flipping
 * this line to system-following belongs in the same pass that fixes that,
 * not before, given this exact "half-themed screen" failure mode already
 * bit this app once (that's the whole reason this comment existed in the
 * first place).
 *
 * SAFE AREA — `react-native-safe-area-context` was a dependency with zero
 * actual usage anywhere in the app until now: no `SafeAreaProvider`, no
 * `useSafeAreaInsets()` call anywhere, on any screen. With `headerShown:
 * false` on the Stack below, react-native-screens gives every routed
 * screen the full device bounds edge-to-edge — so every custom header a
 * screen builds itself (a back arrow + title as the first row of its own
 * ScrollView, the pattern used everywhere in this app) rendered flush
 * against the status bar / notch, with the back arrow frequently sitting
 * under the notch or status-bar touch-interception area and unpressable.
 * Fixing this per-screen would mean touching ~35 files and re-breaking the
 * next time someone adds a screen with the same header pattern. Fixing it
 * once here, in the single wrapper every screen in the app (auth,
 * contractor, worker) renders inside of, is the actual single point of
 * fix: `RootShell` reads the real device inset and pads the whole Stack by
 * it, so OfflineBanner and every screen's own header sit below the status
 * bar / notch on every device, without any screen needing to know about
 * safe areas itself. `SafeAreaProvider` has to wrap `RootShell` (not be
 * inside it) since `useSafeAreaInsets()` only works within its subtree.
 */
function RootShell() {
  const insets = useSafeAreaInsets();
  return (
    <YStack flex={1} paddingTop={insets.top}>
      {/* Below the safe-area inset, above the Stack — visible across auth,
          contractor, and worker screens alike. Deliberately not
          `position: absolute`: it pushes content down rather than
          floating over it, so it never covers a header/back button.
          PHASE 1 — now also carries the sync-status signal (offline /
          syncing / synced / failed); see OfflineBanner.tsx's own header. */}
      <OfflineBanner />
      {/* Admin remediation Tier 2.2 — deliberately below OfflineBanner, not
          above/replacing it. See AnnouncementBanner.tsx's own header for
          the stacking rationale (Doc 05 doesn't cover this new banner). */}
      <AnnouncementBanner />
      {/* Phase 18 — Doc 03 §3.3/§3.9 offline sync. Renders nothing;
          triggers runSync() on app foreground and network reconnect.
          See its own header for why those two edges specifically. */}
      <AutoSync />
      {/* PHASE 9 §2.2 — renders nothing; routes a tapped push notification
          (live or cold-start) to the right screen. See its own header for
          the routing table. */}
      <NotificationRouter />
      {/* Phase 12 (improvement-plan §6.4) — renders nothing; checks for
          and applies an OTA update on foreground. See its own header for
          the adopt-vs-defer decision. */}
      <OtaUpdateChecker />
      {/* headerShown: false only — no `animation` override here, so
          expo-router keeps react-native-screens' native default stack
          transition (slide-from-right on iOS, platform default on
          Android) rather than an instant cut. */}
      <Stack screenOptions={{ headerShown: false }} />
      {/* Phase 12 (improvement-plan §6.6) — absolutely positioned, above
          the Stack in z-order so it can actually block interaction with
          whatever screen is underneath when locked. Renders nothing when
          the setting is off or the app isn't locked. See its own header. */}
      <AppLockGate />
    </YStack>
  );
}

/**
 * Phase 24 — ToastProvider mounted once here, same "single root wrapper"
 * pattern as OfflineBanner/AutoSync above, so `useToast()` is callable from
 * any screen without per-screen setup. Nested inside TamaguiProvider
 * (needs themed tokens) and wraps RootShell so toasts float above every
 * screen, including modals/sheets.
 *
 * UI/UX pass — `react-native-gesture-handler`'s `GestureHandlerRootView`
 * has to wrap the entire app (outermost, above even SafeAreaProvider is
 * fine either order, but it must be an ancestor of every screen) or every
 * `Gesture.Pan()`/`GestureDetector` used anywhere (SwipeableRow, Slider,
 * Dispatch's drag-and-drop) silently fails to receive touches on Android.
 * This is the one required root-level change that comes with adding the
 * dependency — every consuming component itself needs no further setup.
 *
 * PHASE 1 (improvement-plan §5.1) — `QueryClientProvider` added as the
 * outermost data-layer wrapper (needs to be an ancestor of every screen
 * that will call `useQuery`/`useMutation`, same reasoning as every other
 * provider here). `attachQueryClientAppStateListener()` is wired via a
 * plain `useEffect` + cleanup in this component rather than at module
 * scope in queryClient.ts, since `AppState.addEventListener` should have
 * exactly one subscription for the app's lifetime, tied to this root
 * component's mount, not to module import (which can re-run under fast
 * refresh in dev).
 *
 * IMPROVEMENT-PLAN — Sora font loading. `@dala/design-tokens` has declared
 * Sora as the display typeface (screen titles, hero numbers, the
 * wordmark) since early on, but nothing ever actually loaded the font
 * files or registered them with Tamagui — every `fontFamily="$display"`
 * reference silently fell back to the OS system font. This `useFonts()`
 * gate loads the two weights this app actually uses (600/700 — see every
 * `$display` call site's own `fontWeight` prop); `tamagui.config.ts`'s new
 * `fonts.display` entry is the other half, mapping `$display` + each
 * weight to these exact loaded keys (see that file's own comment for why
 * both halves were missing, not just this one).
 *
 * No splash-screen gate exists anywhere in this app today (no
 * `expo-splash-screen` dependency, no `preventAutoHideAsync`/`hideAsync`
 * call) — returning `null` below means a very brief blank frame between
 * the OS splash auto-hiding and fonts finishing loading, rather than a
 * held splash transitioning straight to the loaded UI. Adding a proper
 * splash-hold is a real, separate follow-up (new dependency + its own
 * testing), not done silently as part of this fix.
 */
export default function RootLayout() {
  useEffect(() => attachQueryClientAppStateListener(), []);

  const [fontsLoaded] = useFonts({ Sora_600SemiBold, Sora_700Bold });
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              {/* Phase 12 (improvement-plan §10.3) — renders nothing;
                  bridges lib/errorStatus.ts's external store (fed by
                  ErrorBoundary below and sentry.ts's beforeSend hook) into
                  a user-facing toast. Must be inside ToastProvider — see
                  its own header for why. */}
              <GlobalErrorBridge />
              {/* Phase 12 (improvement-plan §10.3) — wraps RootShell, not
                  the other providers above it: a crash inside
                  TamaguiProvider/QueryClientProvider/ToastProvider
                  themselves (vanishingly rare — none of them render
                  app-specific content) would be uncatchable by a boundary
                  nested inside them anyway. RootShell is where every
                  actual screen renders, so it's the boundary that matters. */}
              <ErrorBoundary>
                <RootShell />
              </ErrorBoundary>
            </ToastProvider>
          </QueryClientProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
