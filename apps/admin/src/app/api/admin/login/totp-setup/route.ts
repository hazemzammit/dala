/**
 * First-login TOTP enrollment — Doc 04 §4.3.11 ("admin completes their own
 * TOTP setup on first login"). Only reachable when step1 returned
 * `needsSetup: true` (i.e. the challenge cookie's purpose is 'totp_setup').
 *
 * GET  — returns the pending secret, which is now MINTED ONCE by
 *        login/step1/route.ts and carried in the signed challenge cookie
 *        (see that file's comment for why minting here was racy: React
 *        StrictMode double-fires the client mount effect, and a concurrent
 *        pair of minting GETs re-signed the cookie with two different
 *        secrets, so the admin's scanned code could not match the cookie's
 *        at POST time). This handler only ever *reads* it; the fallback
 *        mint below exists solely for challenge cookies created before
 *        step1 started carrying the secret, and is a non-issue on any
 *        fresh first-login flow.
 * POST — verifies a code against the pending secret from the cookie; only
 *        on success is `platform_admins.totp_secret`/`totp_enabled` written
 *        and a real admin_sessions row created.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  signChallengeToken,
  signSessionToken,
  verifyChallengeToken,
} from '@/lib/admin-session';
import { encryptTotpSecret } from '@/lib/crypto/totp-secret';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';
import { buildTotpUri, generateTotpSecret, verifyTotpCode } from '@/lib/totp';

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2h hard cap, Doc 01 §1.3.10

async function requireSetupChallenge() {
  const token = cookies().get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyChallengeToken(token);
  if (!payload || payload.purpose !== 'totp_setup') return null;
  return payload;
}

export async function GET() {
  const challenge = await requireSetupChallenge();
  if (!challenge) {
    return NextResponse.json({ error: 'Session de configuration expirée.' }, { status: 401 });
  }

  const supabase = getAdminSupabaseClient();
  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id, full_name')
    .eq('id', challenge.adminId)
    .maybeSingle();

  if (!admin) {
    return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });
  }

  const secret = challenge.pendingSecret ?? generateTotpSecret();
  if (!challenge.pendingSecret) {
    const newToken = await signChallengeToken({
      adminId: challenge.adminId,
      purpose: 'totp_setup',
      pendingSecret: secret,
    });
    cookies().set(CHALLENGE_COOKIE, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 5,
    });
  }

  const uri = buildTotpUri(secret, admin.full_name as string);

  return NextResponse.json({ secret, uri });
}

export async function POST(request: Request) {
  const challenge = await requireSetupChallenge();
  if (!challenge || !challenge.pendingSecret) {
    return NextResponse.json({ error: 'Session de configuration expirée.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code : '';

  if (!verifyTotpCode(challenge.pendingSecret, code)) {
    return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();
  const encryptedSecret = await encryptTotpSecret(challenge.pendingSecret);
  await supabase
    .from('platform_admins')
    .update({ totp_secret: encryptedSecret, totp_enabled: true })
    .eq('id', challenge.adminId);

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const { data: session, error } = await supabase
    .from('admin_sessions')
    .insert({ admin_id: challenge.adminId, expires_at: expiresAt.toISOString() })
    .select('id')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Impossible de créer la session.' }, { status: 500 });
  }

  await supabase
    .from('platform_admins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', challenge.adminId);

  const sessionToken = await signSessionToken(
    { adminId: challenge.adminId, sessionId: session.id as string },
    expiresAt,
  );

  cookies().set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  cookies().delete(CHALLENGE_COOKIE);

  return NextResponse.json({ ok: true });
}
