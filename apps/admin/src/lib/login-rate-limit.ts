/**
 * Fail-CLOSED attempt limiter for the admin console's login endpoints, on top
 * of the shared check_rate_limit() RPC (fixed window, atomic upsert; counts
 * every call, successful or not).
 *
 * Unlike the customer-facing Edge Function limiter (which fails open so a
 * limiter outage can't take the product down), the admin console is the
 * highest-privilege surface: if the limiter can't answer, login is refused.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AttemptVerdict = 'allowed' | 'limited' | 'unavailable';

export async function checkLoginAttempt(
  supabase: Pick<SupabaseClient, 'rpc'>,
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<AttemptVerdict> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max_requests: maxAttempts,
      p_window_seconds: windowSeconds,
    });
    if (error || typeof data !== 'boolean') return 'unavailable';
    return data ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}

export const LOGIN_WINDOW_SECONDS = 15 * 60;
const DEFAULT_PASSWORD_MAX_ATTEMPTS = 10;
const DEFAULT_TOTP_MAX_ATTEMPTS = 5;

function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * Defaults: 10 password attempts per email and 5 TOTP attempts per admin, per
 * 15 minutes. ADMIN_PASSWORD_MAX_ATTEMPTS / ADMIN_TOTP_MAX_ATTEMPTS may RAISE
 * them for the e2e suite (which performs ~150 logins as 4 admins) but are
 * clamped back to the defaults when NODE_ENV=production, so a stray env var
 * can never loosen production.
 */
export function passwordMaxAttempts(): number {
  const v = envInt('ADMIN_PASSWORD_MAX_ATTEMPTS', DEFAULT_PASSWORD_MAX_ATTEMPTS);
  return isProduction() ? Math.min(v, DEFAULT_PASSWORD_MAX_ATTEMPTS) : v;
}

export function totpMaxAttempts(): number {
  const v = envInt('ADMIN_TOTP_MAX_ATTEMPTS', DEFAULT_TOTP_MAX_ATTEMPTS);
  return isProduction() ? Math.min(v, DEFAULT_TOTP_MAX_ATTEMPTS) : v;
}

/**
 * TOTP replay guard (migration 0096). Always ON in production. Outside
 * production it can be switched off with ADMIN_TOTP_REPLAY_GUARD=off — the
 * e2e suite logs in as the same admin many times inside one 30s step, which a
 * replay guard correctly refuses.
 */
export function totpReplayGuardEnabled(): boolean {
  return isProduction() || process.env.ADMIN_TOTP_REPLAY_GUARD !== 'off';
}
