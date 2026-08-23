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
  const tokenKey = `${config.functionName}:token:${token}`;
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
 * Best-effort client IP extraction. Supabase's Edge Runtime sits behind a
 * gateway that sets x-forwarded-for (confirmed via docs.supabase.com/
 * guides/functions/architecture's own "request enters an edge gateway...
 * the gateway routes traffic" description of the request path) — takes
 * the first (left-most / original client) address in a possibly-comma-
 * separated list. Falls back to a constant string, not null/empty, so a
 * missing header still produces a STABLE rate-limit key (grouping every
 * such request together, which is the conservative failure mode — better
 * to over-limit a same-bucket edge case than to silently skip IP-scoped
 * limiting for it).
 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}
