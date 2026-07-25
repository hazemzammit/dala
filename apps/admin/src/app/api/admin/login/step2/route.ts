/**
 * Doc 04 §4.3.1 — step 2 of admin login: 6-digit TOTP for an
 * already-enrolled admin. Consumes the `admin_challenge` cookie set by
 * step1, issues the real `admin_session` cookie on success.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  signSessionToken,
  verifyChallengeToken,
} from '@/lib/admin-session';
import { decryptTotpSecret } from '@/lib/crypto/totp-secret';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';
import { verifyTotpCode } from '@/lib/totp';

const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2h hard cap, Doc 01 §1.3.10

export async function POST(request: Request) {
  const token = cookies().get(CHALLENGE_COOKIE)?.value;
  const challenge = token ? await verifyChallengeToken(token) : null;

  if (!challenge || challenge.purpose !== 'totp') {
    return NextResponse.json({ error: 'Session expirée, reconnectez-vous.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code : '';

  const supabase = getAdminSupabaseClient();
  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id, totp_secret')
    .eq('id', challenge.adminId)
    .maybeSingle();

  if (!admin?.totp_secret) {
    return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });
  }

  let decryptedSecret: string;
  try {
    decryptedSecret = await decryptTotpSecret(admin.totp_secret as string);
  } catch (err) {
    console.error('[login/step2] failed to decrypt stored TOTP secret:', err);
    return NextResponse.json(
      { error: 'Erreur de configuration 2FA — contactez un Super Admin.' },
      { status: 500 },
    );
  }

  if (!verifyTotpCode(decryptedSecret, code)) {
    return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const { data: session, error } = await supabase
    .from('admin_sessions')
    .insert({ admin_id: admin.id, expires_at: expiresAt.toISOString() })
    .select('id')
    .single();

  if (error || !session) {
    return NextResponse.json({ error: 'Impossible de créer la session.' }, { status: 500 });
  }

  await supabase
    .from('platform_admins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', admin.id);

  const sessionToken = await signSessionToken(
    { adminId: admin.id as string, sessionId: session.id as string },
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
