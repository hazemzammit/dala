import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Session persistence uses SecureStore (Keychain/Keystore-backed), never
 * AsyncStorage, since refresh tokens are long-lived (30 days, Doc 01 §1.3.9)
 * and shouldn't sit in plain storage.
 */
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    // Bounds EVERY request this client makes — auth (including the
    // background token-refresh ticker), PostgREST, Storage, Edge Functions,
    // and the WatermelonDB sync that reuses this same client. See
    // lib/fetchWithTimeout.ts's own header for the device-measured bug this
    // closes: React Native's fetch has no timeout of its own, so a backend
    // that silently drops packets (rather than refusing the connection)
    // left `app/index.tsx`'s bootstrap chain hanging for ~5 minutes on the
    // splash, one hung call after another. Set here, at construction,
    // rather than per call site, so no future screen or query can forget
    // it — the alternative (every `.from()`/`.rpc()`/`fetch()` call site
    // opting in) is exactly how the original gap went unnoticed.
    global: { fetch: fetchWithTimeout },
  },
);
