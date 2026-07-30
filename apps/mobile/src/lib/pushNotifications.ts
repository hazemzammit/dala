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

  const { data } = await Notifications.getExpoPushTokenAsync();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { error: 'no_session' };

  const { error } = await supabase
    .from('profiles')
    .update({ expo_push_token: data })
    .eq('id', session.user.id);

  if (error) return { error: error.message };

  return { token: data };
}
