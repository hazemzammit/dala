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

  // Empty allowlist: FAIL CLOSED in production. An empty value there can only
  // be a misconfiguration, and a security control must not silently disappear
  // when misconfigured — a broken deploy should be down, not open to the
  // internet. This is deliberately loud rather than permissive: production
  // MUST set ADMIN_IP_ALLOWLIST, and until it does, every request is blocked.
  if (allowlist.length === 0) {
    if (process.env.NODE_ENV === 'production') {
      warnOnceEmptyAllowlist();
      return false;
    }
    // Non-production only (local dev, and the CI admin-e2e job, which
    // deliberately sets ADMIN_IP_ALLOWLIST= so the suite can drive the app
    // from localhost): gate disabled, unchanged.
    return true;
  }

  // NextRequest.ip was removed in Next 15; the platform's X-Forwarded-For is the source now.
  const requestIp = getClientIp(request.headers);
  return allowlist.includes(requestIp);
}

let warnedEmptyAllowlist = false;
function warnOnceEmptyAllowlist() {
  if (warnedEmptyAllowlist) return;
  warnedEmptyAllowlist = true;
  console.error(
    '[admin] ADMIN_IP_ALLOWLIST is empty in production: blocking all requests (fail-closed). ' +
      "Set it to the operators' egress IPs.",
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  if (!isAllowedIp(request) && pathname !== '/access-denied') {
    // A real 403 (not a 200 rewrite) so monitoring, scanners and API clients
    // can tell "blocked" from "served".
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/access-denied';
    return NextResponse.rewrite(url, { status: 403 });
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
  // Static files in /public (logos, favicon, fonts…) must bypass the gate.
  // next/image's optimizer fetches `/logo-full.png` server-side WITHOUT the
  // admin session cookie; if the middleware answers that fetch with a
  // redirect to /login (or the /access-denied rewrite), the optimizer gets
  // HTML instead of an image and throws
  // "ImageError: Unable to optimize image and unable to fallback to upstream image".
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?)$).*)'],
};
