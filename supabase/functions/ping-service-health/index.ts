// supabase/functions/ping-service-health/index.ts
//
// Doc 06 §6.3 — Services Health infra grid. See migration 0032's header
// for the Konnect scope cut. Invocation: pg_cron + pg_net, every 5
// minutes, same shared Vault secrets as 0026/0027/0030 (no new secret
// registered).
//
// Each check is a real network call against the actual service, not a
// simulated result:
//   - supabase_auth: Supabase Auth admin API, listUsers(page 1, perPage 1)
//     via the service-role client already used everywhere else in this
//     repo's Edge Functions.
//   - supabase_storage: Supabase Storage listBuckets().
//   - resend: GET https://api.resend.com/domains with RESEND_API_KEY —
//     the same key supabase/functions/_shared/resend.ts already sends
//     real emails with.
//   - expo_push: POST https://exp.host/--/api/v2/push/send with an empty
//     message array. Expo has no dedicated health-check endpoint; getting
//     ANY HTTP response back (200 with an empty results array, or a 4xx)
//     counts as "up" — this checks reachability, not deeper service
//     health. Only a network-level failure (timeout, DNS, connection
//     refused) counts as "down".
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const RETENTION_DAYS = 7;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const start = performance.now();
  const result = await fn();
  return { ms: Math.round(performance.now() - start), result };
}

Deno.serve(async (_req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const checks: {
    service_name: string;
    status: 'up' | 'down';
    latency_ms: number | null;
    error_message: string | null;
  }[] = [];

  // --- supabase_auth ---
  try {
    const { ms, result } = await timed(() => admin.auth.admin.listUsers({ page: 1, perPage: 1 }));
    if (result.error) throw new Error(result.error.message);
    checks.push({
      service_name: 'supabase_auth',
      status: 'up',
      latency_ms: ms,
      error_message: null,
    });
  } catch (e) {
    checks.push({
      service_name: 'supabase_auth',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  // --- supabase_storage ---
  try {
    const { ms, result } = await timed(() => admin.storage.listBuckets());
    if (result.error) throw new Error(result.error.message);
    checks.push({
      service_name: 'supabase_storage',
      status: 'up',
      latency_ms: ms,
      error_message: null,
    });
  } catch (e) {
    checks.push({
      service_name: 'supabase_storage',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  // --- resend ---
  try {
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) throw new Error('RESEND_API_KEY non configurée.');
    const { ms, result } = await timed(() =>
      fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${resendKey}` },
      }),
    );
    // Any HTTP response (even 401/403 from a bad key) means Resend itself
    // is reachable — an auth failure is a config problem, not an outage,
    // but still surfaced via error_message for visibility.
    checks.push({
      service_name: 'resend',
      status: 'up',
      latency_ms: ms,
      error_message: result.ok ? null : `HTTP ${result.status}`,
    });
  } catch (e) {
    checks.push({
      service_name: 'resend',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  // --- expo_push ---
  try {
    const { ms } = await timed(() =>
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '[]',
      }),
    );
    checks.push({ service_name: 'expo_push', status: 'up', latency_ms: ms, error_message: null });
  } catch (e) {
    checks.push({
      service_name: 'expo_push',
      status: 'down',
      latency_ms: null,
      error_message: e instanceof Error ? e.message : 'Erreur inconnue.',
    });
  }

  await admin.from('service_health_checks').insert(checks);

  // Retention — prune anything older than RETENTION_DAYS on the same
  // tick, rather than a separate job for a table with no long-term audit
  // value (see migration 0032 comment).
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await admin.from('service_health_checks').delete().lt('checked_at', cutoff);

  return new Response(JSON.stringify({ checks }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
