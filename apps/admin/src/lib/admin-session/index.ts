/**
 * Admin session model — Doc 01 §1.3.10 / Doc 04 §4.3.1.
 *
 * Deliberately NOT Supabase Auth's session cookie (that's the regular
 * 30-day contractor/worker model). Two short-lived signed JWTs are used
 * here, verified locally with `jose` (works in both the Edge middleware
 * runtime and normal Node route handlers) rather than round-tripping to
 * the DB on every request:
 *
 *  - `admin_challenge` cookie: issued after step 1 (email+password) passes,
 *    proves "this browser just passed step 1 for this admin_id", 5-minute
 *    expiry, consumed by step 2 (TOTP).
 *  - `admin_session` cookie: issued after step 2 (TOTP) passes, points at
 *    an `admin_sessions` row (source of truth for revocation/impersonation
 *    state) and is itself capped at 2 hours, matching §1.3.10 — this JWT's
 *    own `exp` claim is never renewed past the original 2-hour window.
 *
 * The JWT's `exp` claim is checked locally (fast, edge-safe); the DB row
 * is the authority checked by route handlers for anything that must be
 * revocable mid-session (logout, forced revoke, impersonation state).
 */
import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

function getSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'Missing ADMIN_SESSION_SECRET. Generate one (e.g. `openssl rand -base64 32`) ' +
        'and set it in apps/admin/.env.local — never reuse the Supabase service role key for this.',
    );
  }
  return encoder.encode(secret);
}

export const CHALLENGE_COOKIE = 'admin_challenge';
export const SESSION_COOKIE = 'admin_session';

export interface ChallengePayload {
  adminId: string;
  purpose: 'totp' | 'totp_setup';
  /** Only present during first-login TOTP enrollment (purpose = 'totp_setup')
   * — the not-yet-persisted secret rides in the signed challenge cookie
   * rather than a DB write, so an abandoned setup never leaves a half-
   * configured secret behind. Persisted to `platform_admins.totp_secret`
   * only once the admin proves they scanned it correctly. */
  pendingSecret?: string;
}

export interface SessionPayload {
  adminId: string;
  sessionId: string; // admin_sessions.id — the DB row is the revocation source of truth
}

export async function signChallengeToken(payload: ChallengePayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getSecret());
}

export async function verifyChallengeToken(token: string): Promise<ChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.adminId !== 'string' || typeof payload.purpose !== 'string') return null;
    return {
      adminId: payload.adminId,
      purpose: payload.purpose as ChallengePayload['purpose'],
      pendingSecret: typeof payload.pendingSecret === 'string' ? payload.pendingSecret : undefined,
    };
  } catch {
    return null;
  }
}

/** `expiresAt` must be the admin_sessions row's own expires_at — the JWT's
 * exp mirrors it exactly so the two never drift apart. */
export async function signSessionToken(payload: SessionPayload, expiresAt: Date): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.adminId !== 'string' || typeof payload.sessionId !== 'string') return null;
    return { adminId: payload.adminId, sessionId: payload.sessionId };
  } catch {
    return null;
  }
}
