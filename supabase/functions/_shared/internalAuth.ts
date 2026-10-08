// Caller authentication for INTERNAL Edge Functions (cron / platform-only).
//
// Why this exists: functions such as rotate-totp-encryption-key,
// generate-subscription-charges, send-digest-notifications and
// send-announcement-notifications run with the service-role key and never
// looked at the incoming request. With verify_jwt on (the default) the
// Supabase gateway only proves the caller holds SOME valid JWT — an ordinary
// end-user session qualifies — so any signed-up user could trigger them.
//
// Contract: the caller must present `Authorization: Bearer <secret>` where
// <secret> equals the function runtime's SUPABASE_SERVICE_ROLE_KEY (this is
// exactly what the pg_cron jobs in migrations 0026/0027/0030/0043 already
// send from Vault), or INTERNAL_FUNCTION_SECRET if that env var is set
// (escape hatch for projects whose cron uses a different credential than
// the runtime's service-role key, e.g. after moving to sb_secret_ keys).
// Comparison is constant-time. Fails CLOSED if no secret is configured.

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

// Constant-time on the digests, so neither content nor length leaks.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= (da[i] ?? 0) ^ (db[i] ?? 0);
  return diff === 0;
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Returns null when the caller is authorised, or a ready-to-return Response
 * (401/500) when it is not. Usage at the top of Deno.serve:
 *   const denied = await requireInternalCaller(req);
 *   if (denied) return denied;
 */
export async function requireInternalCaller(req: Request): Promise<Response | null> {
  const accepted = [
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    Deno.env.get('INTERNAL_FUNCTION_SECRET'),
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);

  if (accepted.length === 0) {
    console.error('internalAuth: no SUPABASE_SERVICE_ROLE_KEY / INTERNAL_FUNCTION_SECRET configured');
    return json(500, 'server_misconfigured');
  }

  const header = req.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const presented = match?.[1]?.trim();
  if (!presented) return json(401, 'unauthorized');

  // Evaluate every candidate (no early exit) to keep timing uniform.
  const results = await Promise.all(accepted.map((s) => timingSafeEqual(presented, s)));
  return results.some(Boolean) ? null : json(401, 'unauthorized');
}
