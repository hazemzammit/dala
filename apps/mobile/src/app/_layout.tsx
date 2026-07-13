import { Stack } from 'expo-router';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '@/lib/tamagui.config';

/**
 * Doc 03 §3.1 — Splash checks app_version_check() before any session logic
 * runs (Doc 01 §1.8). Wire that check into a Splash screen ahead of this
 * Stack before shipping — this file is the shell, not the full routing
 * logic yet.
 */
export default function RootLayout() {
  return (
    <TamaguiProvider config={tamaguiConfig}>
      <Stack screenOptions={{ headerShown: false }} />
    </TamaguiProvider>
  );
}
