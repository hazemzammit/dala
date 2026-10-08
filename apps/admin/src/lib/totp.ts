/**
 * TOTP helpers — Doc 04 §4.3.1 (mandatory 6-digit TOTP, ±1 time-step drift).
 *
 * Wraps `otpauth` (edge/runtime-agnostic, no native crypto bindings) rather
 * than `speakeasy`/`otplib`, which either pull in Node-only APIs or are
 * unmaintained. Kept as a thin wrapper so the rest of the app never imports
 * `otpauth` directly — if this library needs swapping later, only this file
 * changes.
 */
import * as OTPAuth from 'otpauth';

const ISSUER = 'Dala Admin';

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/** otpauth:// URI an admin scans into Google Authenticator / 1Password / etc. */
export function buildTotpUri(secret: string, adminEmail: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: adminEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

/**
 * Verifies a 6-digit code against a base32 secret and returns the ABSOLUTE
 * 30-second time step the code belongs to (unix seconds / 30, adjusted by the
 * matched drift), or null if the code is invalid/malformed.
 * `window: 1` = ±1 time-step (±30s) drift tolerance per §4.3.1.
 * The step is what login step 2 persists to reject replays of a code that was
 * already accepted (see migration 0096). Never throws on a malformed code —
 * a mistyped code is a normal user error, not an exceptional one.
 */
export function verifyTotpCodeStep(secret: string, code: string, nowMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1, timestamp: nowMs });
    if (delta === null) return null;
    return Math.floor(nowMs / 1000 / 30) + delta;
  } catch {
    return null;
  }
}

/** Boolean form, for callers that don't need replay protection (enrollment). */
export function verifyTotpCode(secret: string, code: string): boolean {
  return verifyTotpCodeStep(secret, code) !== null;
}
