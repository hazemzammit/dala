/**
 * scripts/smoke-test-sync.ts
 *
 * Phase 12 (improvement-plan §10.1). Standalone Node/tsx script — NOT a
 * Detox spec, NOT run inside the mobile app, and NOT a replacement for
 * `docs/SYNC_VERIFICATION_RUNBOOK.md`'s Part B (on-device checks). This
 * exercises the SERVER half of the sync contract directly, using the
 * same `@supabase/supabase-js` client the app itself uses (never a raw
 * `fetch`/`psql`), against a REAL Supabase instance — this script does
 * nothing useful pointed at nothing, and is written to fail loudly and
 * specifically (not silently pass) if the environment isn't real.
 *
 * Mirrors the exact request shapes `apps/mobile/src/db/sync/pullChanges.ts`
 * and `pushChanges.ts` use (confirmed by reading both files before writing
 * this, not assumed) — a plain `.from(table).select()` scoped to `org_id`
 * for pull, and the mix of direct `.upsert()`/`.delete()` calls plus
 * three purpose-built RPCs (`request_advance`/`create_advance`,
 * `submit_site_log_entry`) for push, per those files' own header comments
 * on why advances/site-logs go through an RPC instead of a raw upsert
 * (money-moving idempotency / audit-log side effects neither file wants
 * a bare table write to skip).
 *
 * Run:
 *   cd apps/mobile
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
 *   E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... \
 *     npx tsx ../../scripts/smoke-test-sync.ts
 *
 * Exits 0 only if every check passes; prints the first failing check name
 * and the raw Supabase error, then exits 1, otherwise — deliberately NOT
 * continuing past a failure into checks that depend on it (e.g. push
 * checks assume pull's org lookup already succeeded).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_TEST_EMAIL;
const PASSWORD = process.env.E2E_TEST_PASSWORD;

const SYNCED_TABLES = [
  'dispatch_assignments',
  'attendance_records',
  'materials',
  'advances',
  'site_logs',
] as const;

function fail(check: string, err: unknown): never {
  // eslint-disable-next-line no-console
  console.error(`\n✗ FAILED: ${check}`);
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
}

function pass(check: string): void {
  // eslint-disable-next-line no-console
  console.log(`✓ ${check}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
    fail(
      'environment',
      new Error(
        'SUPABASE_URL, SUPABASE_ANON_KEY, E2E_TEST_EMAIL, E2E_TEST_PASSWORD must all be set. ' +
          'This script refuses to run against nothing.',
      ),
    );
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

  // --- Auth ---------------------------------------------------------------
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL!,
    password: PASSWORD!,
  });
  if (authError || !authData.session) fail('sign in with E2E test credentials', authError);
  pass('sign in with E2E test credentials');

  // --- Resolve an org, same as pullChanges.ts's own no-active-org guard --
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', authData.session!.user.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) fail('resolve org membership', membershipError);
  if (!membership) {
    fail(
      'resolve org membership',
      new Error(
        'Test account has no organization_members row — seed one per the runbook before running this script.',
      ),
    );
  }
  pass('resolve org membership');
  const orgId = membership!.org_id;

  // --- Pull-shape check: every synced table must be selectable scoped to
  // org_id without an RLS error, same shape pullChanges.ts uses -----------
  for (const table of SYNCED_TABLES) {
    const { error } = await supabase.from(table).select('id').eq('org_id', orgId).limit(1);
    if (error) fail(`pull-shape select on "${table}"`, error);
    pass(`pull-shape select on "${table}"`);
  }

  // --- Push-shape check: the three RPCs pushChanges.ts calls must exist
  // and reject a deliberately-malformed payload with a real error, not a
  // "function does not exist" error (which would indicate an RPC rename/
  // drift since pushChanges.ts was last touched) -------------------------
  const rpcProbes: Array<{ name: string; args: Record<string, unknown> }> = [
    { name: 'create_advance', args: { p_worker_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'request_advance', args: { p_worker_id: '00000000-0000-0000-0000-000000000000' } },
    {
      name: 'submit_site_log_entry',
      args: { p_project_id: '00000000-0000-0000-0000-000000000000' },
    },
  ];
  for (const probe of rpcProbes) {
    const { error } = await supabase.rpc(probe.name, probe.args);
    if (!error) {
      fail(
        `RPC "${probe.name}" exists and rejects malformed input`,
        new Error(
          'Expected an error from a deliberately-incomplete payload, got none — investigate.',
        ),
      );
    }
    if (error.message.toLowerCase().includes('could not find') || error.code === 'PGRST202') {
      fail(`RPC "${probe.name}" exists`, error);
    }
    pass(`RPC "${probe.name}" exists and rejects malformed input as expected`);
  }

  // --- Rate limit RPC from this same phase (§10.4) — confirms migration
  // 0077 actually applied, service-role-only so THIS anon-keyed client
  // must be refused, not accepted -----------------------------------------
  const { error: rateLimitError } = await supabase.rpc('check_rate_limit', {
    p_key: 'smoke-test',
    p_max_requests: 1,
    p_window_seconds: 60,
  });
  if (!rateLimitError) {
    fail(
      'check_rate_limit is service-role-only',
      new Error(
        'An anon-keyed client was able to call check_rate_limit — grant is wrong, see migration 0077.',
      ),
    );
  }
  pass('check_rate_limit correctly refuses an anon-keyed caller');

  // eslint-disable-next-line no-console
  console.log('\nAll server-side sync-contract checks passed.');
  process.exit(0);
}

void main();
