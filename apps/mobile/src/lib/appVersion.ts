import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * apps/mobile/src/lib/appVersion.ts
 *
 * Doc 01 §1.8 / Doc 03 §3.1 — checked once per cold start, before any
 * session logic runs, via the anon-callable `app_version_check` RPC
 * (supabase/migrations/0011_app_versions.sql). Must never require a login.
 */

export interface AppVersionCheckResult {
  latestVersion: string;
  minSupportedVersion: string;
  forceUpdate: boolean;
}

const CURRENT_BUILD = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Doc 03 §3.1's "fails open" rule: if the network call itself fails (e.g.
 * offline on cold start), this returns `forceUpdate: false` so a legitimate
 * offline-first user isn't locked out of an app they're already running —
 * it must NOT throw and must NOT be treated as "needs update" by the caller.
 */
export async function checkAppVersion(): Promise<AppVersionCheckResult> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  try {
    const { data, error } = await supabase.rpc('app_version_check', {
      p_platform: platform,
      p_build: CURRENT_BUILD,
    });

    if (error || !data) {
      return {
        latestVersion: CURRENT_BUILD,
        minSupportedVersion: CURRENT_BUILD,
        forceUpdate: false,
      };
    }

    return {
      latestVersion: data.latest_version,
      minSupportedVersion: data.min_supported_version,
      forceUpdate: Boolean(data.force_update),
    };
  } catch {
    return { latestVersion: CURRENT_BUILD, minSupportedVersion: CURRENT_BUILD, forceUpdate: false };
  }
}

export function currentBuild(): string {
  return CURRENT_BUILD;
}
