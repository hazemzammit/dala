/**
 * Doc 04 §4.3.1 — step 1 of admin login: email + password.
 * On success, issues a short-lived `admin_challenge` cookie and tells the
 * client whether to route to TOTP entry or first-time TOTP setup.
 *
 * Deliberately generic on every failure path (wrong password, email not
 * found, or email valid but not an admin) — never reveal which case it was,
 * matching the same anti-enumeration posture §4.3.1 asks for at the IP-gate
 * layer.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { CHALLENGE_COOKIE, signChallengeToken } from '@/lib/admin-session';
import { getClientIp } from '@/lib/get-client-ip';
import { getAdminSupabaseClient, getAuthOnlySupabaseClient } from '@/lib/supabase/admin-client';
import { generateTotpSecret } from '@/lib/totp';

const GENERIC_ERROR = 'Identifiants invalides.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
  }

  const authClient = getAuthOnlySupabaseClient();
  const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const supabase = getAdminSupabaseClient();
  const { data: admin } = await supabase
    .from('platform_admins')
    .select('id, totp_enabled, allowed_ips')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!admin) {
    // Valid Dala credentials, but this account has no platform_admins row.
    // Same generic error as a wrong password — do not reveal "not an admin."
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Doc 04 §4.3.1 — per-admin IP allowlist (platform_admins.allowed_ips,
  // from migration 0009). Second layer on top of middleware's
  // platform-wide ADMIN_IP_ALLOWLIST gate: that one blocks the whole app
  // before a request even reaches the login form; this one lets a
  // specific admin be further restricted to their own known IPs (e.g. a
  // Support admin who should only ever log in from the office network)
  // without changing the platform-wide list. NULL/empty = no per-admin
  // restriction beyond the platform-wide gate.
  const allowedIps = (admin.allowed_ips as string[] | null) ?? [];
  if (allowedIps.length > 0) {
    const requestIp = getClientIp(request.headers);
    if (!allowedIps.includes(requestIp)) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }
  }

  const needsSetup = !admin.totp_enabled;
  // Mint the first-login TOTP secret HERE, atomically with the challenge
  // cookie — not in the /totp-setup GET handler. The GET fires multiple
  // times (React StrictMode double-mounts the client effect, and any second
  // client sharing the URL adds more), and each GET that *mints* re-signs
  // the cookie it just read before the previous GET's write lands — so a
  // concurrent pair of GETs produces two different secrets and the admin's
  // scanned code no longer matches the cookie's at POST time ("Code
  // invalide.", no code of ours ever wrong). Minting once here guarantees
  // every GET returns the identical secret. Same trust boundary as before
  // (a signed cookie already rides from step1; the pending secret just
  // joins it instead of being invented later by the first GET). Persisted
  // to platform_admins.totp_secret only when verification proves the admin
  // scanned it.
  const pendingSecret = needsSetup ? generateTotpSecret() : undefined;
  const token = await signChallengeToken({
    adminId: admin.id as string,
    purpose: needsSetup ? 'totp_setup' : 'totp',
    pendingSecret,
  });

  cookies().set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 5,
  });

  return NextResponse.json({ needsSetup });
}
