import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TamaguiProvider, YStack } from 'tamagui';

import { AutoSync } from '@/components/shell/AutoSync';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ToastProvider } from '@/components/ui/Toast';
import tamaguiConfig from '@/lib/tamagui.config';

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
          floating over it, so it never covers a header/back button. */}
      <OfflineBanner />
      {/* Phase 18 — Doc 03 §3.3/§3.9 offline sync. Renders nothing;
          triggers runSync() on app foreground and network reconnect.
          See its own header for why those two edges specifically. */}
      <AutoSync />
      {/* headerShown: false only — no `animation` override here, so
          expo-router keeps react-native-screens' native default stack
          transition (slide-from-right on iOS, platform default on
          Android) rather than an instant cut. */}
      <Stack screenOptions={{ headerShown: false }} />
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
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
          <ToastProvider>
            <RootShell />
          </ToastProvider>
        </TamaguiProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
