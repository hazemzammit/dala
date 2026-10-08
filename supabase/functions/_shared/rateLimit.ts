// supabase/functions/_shared/rateLimit.ts
//
// Phase 12 (improvement-plan §10.4). Thin wrapper around the
// service-role-only check_rate_limit() RPC (migration 0077) — see that
// migration's own Part 1 header for why accept-worker-invitation and
// accept-organization-invitation are the two functions that genuinely
// need this (both bypass Supabase Auth's own platform rate limits by
// using a service-role client) and why every other public-facing
// function does not.
//
// Two independent keys per call site, both checked, matching every other
// shared helper in this directory (_shared/pdfBranding.ts, _shared/cors.ts)
// in staying a small, single-purpose function rather than a class/object —
// this codebase has no shared-helper "framework," just plain functions:
//   - token-scoped: bounds retries against ONE invitation (a legitimate
//     person re-submitting after a typo'd password should never be
//     blocked by this).
//   - IP-scoped: bounds how many DIFFERENT tokens/invitations one source
//     can hammer, which the token-scoped check alone can't catch (a new
//     token per attempt would defeat it).
// A request is allowed only if BOTH checks pass — either one tripping is
// enough to reject.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export interface RateLimitConfig {
  /** e.g. 'accept-worker-invitation' — becomes part of both composed keys. */
  functionName: string;
  /** Max requests for a single token within the window. */
  maxPerToken: number;
  /** Max requests for a single IP within the window. */
  maxPerIp: number;
  windowSeconds: number;
}

/**
 * Returns `{ allowed: true }` or `{ allowed: false, reason }`. Never
 * throws on a normal rate-limit rejection — only a genuine infrastructure
 * failure (the RPC call itself erroring) propagates, and even that is
 * caught here and treated as fail-open (see the comment below) rather
 * than blocking every legitimate request if the rate-limit table itself
 * has a problem — the same fail-open-on-infrastructure-error posture
 * lib/appVersion.ts already documents for the mobile app's own version
 * check ("never blocks a legitimate offline-first user").
 */
export async function checkInviteAcceptRateLimit(
  admin: ReturnType<typeof createClient>,
  config: RateLimitConfig,
  token: string,
  clientIp: string,
): Promise<{ allowed: boolean; reason?: string }> {
  // Caps: `token` is attacker-supplied; an unbounded key would let anyone bloat the table.
  const tokenKey = `${config.functionName}:token:${token.slice(0, 128)}`;
  const ipKey = `${config.functionName}:ip:${clientIp}`;

  try {
    const [tokenResult, ipResult] = await Promise.all([
      admin.rpc('check_rate_limit', {
        p_key: tokenKey,
        p_max_requests: config.maxPerToken,
        p_window_seconds: config.windowSeconds,
      }),
      admin.rpc('check_rate_limit', {
        p_key: ipKey,
        p_max_requests: config.maxPerIp,
        p_window_seconds: config.windowSeconds,
      }),
    ]);

    if (tokenResult.error || ipResult.error) {
      // Infrastructure failure reading/writing the rate-limit table
      // itself — fail open rather than turning a transient DB hiccup
      // into every real invite-accept failing. Logged for follow-up, not
      // silently swallowed.
      console.error(
        `[rateLimit] check_rate_limit RPC error for ${config.functionName}`,
        tokenResult.error ?? ipResult.error,
      );
      return { allowed: true };
    }

    if (tokenResult.data === false) {
      return { allowed: false, reason: 'too_many_attempts_for_this_invitation' };
    }
    if (ipResult.data === false) {
      return { allowed: false, reason: 'too_many_attempts' };
    }
    return { allowed: true };
  } catch (err) {
    console.error(`[rateLimit] unexpected error for ${config.functionName}`, err);
    return { allowed: true };
  }
}

/**
 * Client IP for rate-limit keys.
 *
 * The old version took the LEFT-most X-Forwarded-For entry. That end of the header is written by
 * the CLIENT (`X-Forwarded-For: 1.2.3.<random>`), so an attacker could mint a fresh IP bucket on
 * every request and the per-IP limit never tripped. Now:
 *   1. `cf-connecting-ip` — set (overwritten) by Cloudflare, which Supabase's edge sits behind;
 *      not client-controllable.
 *   2. otherwise X-Forwarded-For counted from the RIGHT, skipping TRUSTED_PROXY_HOPS-1 entries
 *      (default 1 hop = the entry appended by our own gateway).
 * The value is sanitised and length-capped so it cannot be used to bloat the rate-limit table.
 * Falls back to a constant so a missing header still yields a STABLE key (over-limiting a shared
 * bucket is the safe failure mode, not skipping the limit).
 */
export function extractClientIp(req: Request): string {
  const clean = (v: string | null | undefined): string | null => {
    const t = v?.trim().slice(0, 64);
    return t && /^[0-9a-fA-F:.]+$/.test(t) ? t : null;
  };

  const cf = clean(req.headers.get('cf-connecting-ip'));
  if (cf) return cf;

  const parts = (req.headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const configured = Number.parseInt(Deno.env.get('TRUSTED_PROXY_HOPS') ?? '', 10);
  const hops = Number.isFinite(configured) && configured >= 1 ? configured : 1;
  const fromRight = clean(parts.length >= hops ? parts[parts.length - hops] : parts[0]);
  return fromRight ?? 'unknown';
}

export interface RateLimitCheck {
  /** Fully composed key, e.g. `mfa-recover:email:a@b.c`. Truncated to 200 chars. */
  key: string;
  max: number;
}

/**
 * Generic multi-key limiter over the same check_rate_limit() RPC. Every check must pass.
 * `failOpen` decides what an INFRASTRUCTURE failure (RPC error/throw) means:
 *   true  (default) — availability first: used where a limiter outage must not block real users
 *                     (invitation accept, sign-up).
 *   false           — security first: used for credential-guessing surfaces (MFA recovery), where
 *                     "the limiter is down" must not become "unlimited guesses".
 */
export async function enforceRateLimits(
  admin: ReturnType<typeof createClient>,
  checks: RateLimitCheck[],
  windowSeconds: number,
  options: { failOpen?: boolean } = {},
): Promise<{ allowed: boolean; reason?: 'rate_limited' | 'limiter_unavailable' }> {
  const failOpen = options.failOpen ?? true;
  try {
    const results = await Promise.all(
      checks.map((c) =>
        admin.rpc('check_rate_limit', {
          p_key: c.key.slice(0, 200),
          p_max_requests: c.max,
          p_window_seconds: windowSeconds,
        }),
      ),
    );
    if (results.some((r) => r.error || typeof r.data !== 'boolean')) {
      console.error('[rateLimit] check_rate_limit RPC error', results.find((r) => r.error)?.error);
      return failOpen ? { allowed: true } : { allowed: false, reason: 'limiter_unavailable' };
    }
    return results.every((r) => r.data === true)
      ? { allowed: true }
      : { allowed: false, reason: 'rate_limited' };
  } catch (err) {
    console.error('[rateLimit] unexpected error', err);
    return failOpen ? { allowed: true } : { allowed: false, reason: 'limiter_unavailable' };
  }
}
