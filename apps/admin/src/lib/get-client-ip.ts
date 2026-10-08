/**
 * Client IP from X-Forwarded-For, for the admin console's IP allowlist,
 * per-admin allowed_ips and audit-log IP capture.
 *
 * The header is a comma-separated chain: the client can put ANYTHING at the
 * left ("X-Forwarded-For: 1.2.3.4"), and every proxy that forwards the request
 * APPENDS the address it received the connection from on the RIGHT. Reading
 * the leftmost entry (as this helper used to) therefore lets any client claim
 * an allowlisted IP — reproduced against the built app: `X-Forwarded-For:
 * <allowlisted>, <real>` passed the gate.
 *
 * Only entries appended by infrastructure YOU operate can be trusted, so the
 * address is taken counting from the right. ADMIN_TRUSTED_PROXY_HOPS is the
 * number of trusted proxies in front of the app (default 1: e.g. Vercel, or a
 * single load balancer/nginx; use 2 for Cloudflare -> load balancer). A
 * platform that OVERWRITES the header (Vercel) yields a single entry, which
 * hops=1 reads correctly. With no proxy at all the framework appends the
 * socket address on the right, which also fails safe (the allowlist rejects it).
 */
export function getClientIp(headers: Headers, fallback?: string): string {
  const parts = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const configured = Number.parseInt(process.env.ADMIN_TRUSTED_PROXY_HOPS ?? '', 10);
  const hops = Number.isFinite(configured) && configured >= 1 ? configured : 1;

  const ip = parts.length >= hops ? parts[parts.length - hops] : parts[0];
  return ip ?? fallback ?? '';
}
