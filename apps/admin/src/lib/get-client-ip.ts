/**
 * apps/admin/src/lib/get-client-ip.ts
 *
 * Shared IP-extraction logic used by both middleware.ts (platform-wide
 * ADMIN_IP_ALLOWLIST gate, edge runtime) and login/step1's route handler
 * (per-admin platform_admins.allowed_ips check, Node runtime) — kept in
 * one place so the two layers can't quietly drift on how they read the
 * client IP (e.g. one trusting x-forwarded-for's first entry, the other
 * its last).
 */
export function getClientIp(headers: Headers, fallback?: string): string {
  const forwardedFor = headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() ?? fallback ?? '';
}
