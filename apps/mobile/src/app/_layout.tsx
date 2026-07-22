import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';

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
 */
export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <Stack screenOptions={{ headerShown: false }} />
    </TamaguiProvider>
  );
}
