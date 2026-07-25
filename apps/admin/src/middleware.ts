/**
 * Doc 04 §4.3.1: "IP allowlist check happens server-side before the login
 * form is even rendered meaningfully — a request from a non-allowlisted IP
 * gets a generic 'Accès refusé' page with no login form at all."
 *
 * This runs in the Edge middleware runtime — no DB round-trip here by
 * design (keep it fast, and don't couple the gate to the DB being up).
 * The allowlist is a platform-wide env var, not the per-admin
 * `platform_admins.allowed_ips` column — that column is a second,
 * per-admin layer enforced inside the login route handler itself (Node
 * runtime, DB access available there), not here.
 *
 * Session validation here is JWT-signature/expiry only (fast, edge-safe).
 * The authoritative revocation/impersonation check against the
 * `admin_sessions` DB row happens in `lib/require-admin-session.ts`, used
 * by every route handler and (admin) server component.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from './lib/admin-session';
import { getClientIp } from './lib/get-client-ip';

const PUBLIC_PATHS = ['/login', '/totp', '/totp-setup', '/access-denied'];

function isAllowedIp(request: NextRequest): boolean {
  const allowlist = (process.env.ADMIN_IP_ALLOWLIST ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);

  // Empty allowlist = gate disabled (local dev convenience). Document this
  // loudly: production MUST set ADMIN_IP_ALLOWLIST or this check is a no-op.
  if (allowlist.length === 0) return true;

  const requestIp = getClientIp(request.headers, request.ip);
  return allowlist.includes(requestIp);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  if (!isAllowedIp(request) && pathname !== '/access-denied') {
    const url = request.nextUrl.clone();
    url.pathname = '/access-denied';
    return NextResponse.rewrite(url);
  }

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isApiAuthPath =
    pathname.startsWith('/api/admin/login') || pathname.startsWith('/api/admin/session');

  if (isPublicPath || isApiAuthPath) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  const payload = sessionCookie ? await verifySessionToken(sessionCookie) : null;

  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
