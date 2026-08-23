import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * apps/mobile/src/lib/pushNotifications.ts
 *
 * Doc 02 §2.9a digest notifications, migration 0025's
 * `profiles.expo_push_token` column.
 *
 * `expo-notifications` is imported dynamically inside this function,
 * NOT at module scope. The package has its own module-scope side effect
 * (device push token auto-registration) that fires on import alone and
 * crashes under Expo Go on Android (SDK 53+ removed remote push from
 * Expo Go). Since expo-router eagerly requires every route file to build
 * its route table, a static import here would pull that side effect into
 * every app boot for every user — not just the ones who open this screen
 * and opt in.
 *
 * Called once when the Notifications settings screen is opened and the
 * user has at least one category or the digest toggled on — never
 * requested speculatively at app launch.
 */
type PushResult = { token: string } | { error: string };

export async function registerForPushNotifications(): Promise<PushResult> {
  if (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Platform.OS === 'android'
  ) {
    // Expo Go on Android can't do remote push (SDK 53+). Prefs still save;
    // just skip token registration rather than crashing.
    return { error: 'unsupported_in_expo_go' };
  }

  const Notifications = await import('expo-notifications');

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return { error: 'permission_denied' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  let token: string;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync();
    token = data;
  } catch {
    // Minting a real push token needs FCM actually configured for this
    // build — a genuine `google-services.json` from a real Firebase
    // project (referenced via `android.googleServicesFile` in app.json)
    // plus FCM V1 credentials uploaded to the EAS project; see
    // https://docs.expo.dev/push-notifications/fcm-credentials/. Neither
    // exists in this repo yet, so `getExpoPushTokenAsync()` throws. That's
    // a real infra/credentials setup step this function can't do anything
    // about at runtime — but every OTHER failure path here already
    // degrades to a graceful `{ error }` instead of throwing
    // (permission_denied, unsupported_in_expo_go, no_session), and this
    // one previously didn't. The uncaught throw is exactly what showed up
    // as "Uncaught (in promise, id: 0)... Default FirebaseApp is not
    // initialized" and — worse — it happened before the caller ever got
    // to save the person's actual notification-preference toggle, so
    // their preference silently failed to save too. Catching it here lets
    // prefs still save; the caller decides how (or whether) to surface
    // the missing-push-credentials state.
    return { error: 'token_unavailable' };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'no_session' };

  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('id', session.user.id);

  if (error) return { error: error.message };

  return { token };
}

/**
 * PHASE 9 §2.2 — notification-tap deep linking. Mirrors
 * registerForPushNotifications()'s own dynamic-import + Expo-Go/Android
 * guard above (see that function's header comment for exactly why: a
 * static `expo-notifications` import at module scope crashes under Expo
 * Go on Android regardless of whether push was ever registered — the
 * `addNotificationResponseReceivedListener` API lives in the same module,
 * so it needs the identical guard, not a lighter one just because this
 * half doesn't mint a token).
 *
 * Handles BOTH ways a tap can reach the app:
 *   1. App already running (foreground/background, not killed) — a tap
 *      fires `addNotificationResponseReceivedListener` immediately.
 *   2. App was fully killed — the tap is what LAUNCHES the app, and by
 *      the time this function's caller (NotificationRouter, mounted in
 *      the root layout) runs its first effect, the tap has already
 *      happened and the listener above would never fire for it.
 *      `getLastNotificationResponse()` is Expo's own answer to this exact
 *      case — checked once on mount, alongside the live listener, not
 *      instead of it.
 * Both paths route through the SAME `onResponse` callback — the caller
 * doesn't need to know or care which path fired.
 */
export async function setupNotificationResponseListener(
  onResponse: (data: Record<string, unknown>) => void,
): Promise<() => void> {
  if (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient &&
    Platform.OS === 'android'
  ) {
    return () => {};
  }

  const Notifications = await import('expo-notifications');

  // Cold start: the app was launched BY this tap. Checked once, before
  // the live listener is attached below — if this resolves to a real
  // response, that response has already "happened" and would never reach
  // the live listener. `getLastNotificationResponseAsync()`, not the
  // deprecated sync `getLastNotificationResponse()` — same "SDK 54's
  // current API, not the legacy one" discipline reports.tsx's own header
  // already documents for `expo-file-system`.
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse) {
    const data = lastResponse.notification.request.content.data as Record<string, unknown>;
    onResponse(data ?? {});
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown>;
    onResponse(data ?? {});
  });

  return () => subscription.remove();
}
