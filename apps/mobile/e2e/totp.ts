/**
 * apps/mobile/e2e/totp.ts
 *
 * The 2FA enroll flow (security-settings.tsx) shows the raw base32 secret
 * as manually-selectable text alongside the QR code (there's no way for a
 * Detox test to "scan" a QR code rendered inside the app under test). This
 * reads that secret off-screen and computes the real, currently-valid
 * 6-digit TOTP code from it — same algorithm Google Authenticator/Authy
 * run, and the same one Supabase Auth's `mfa.verify` checks against
 * server-side. Without this, the enroll/login-with-TOTP e2e test could
 * only ever exercise the error path (a wrong code), never the real one.
 */
import { generateSync } from 'otplib';

export function generateTotpCode(base32Secret: string): string {
  // otplib v13's functional API — strategy defaults to 'totp'. The old
  // `authenticator.generate(secret)` singleton (v11/v12) doesn't exist in
  // this major version.
  return generateSync({ secret: base32Secret.replace(/\s+/g, '') });
}
