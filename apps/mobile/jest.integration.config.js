/**
 * apps/mobile/jest.integration.config.js
 *
 * Doc 02 §2.11 — a deliberately SEPARATE config from the default
 * `package.json`#jest block, kept genuinely separate the way Phase 9's
 * testing-discipline note requires (unit config and e2e config must not
 * blur together, and this is really a third kind: DB-integration, not
 * unit, not device-e2e).
 *
 * Phase 12: widened from RLS-only to all three DB-integration suites Doc 02
 * §2.11 calls out as needing this same fixture foundation — `displayName`
 * renamed from 'rls-integration' to 'db-integration' to match (the
 * `test:rls` script name in package.json is UNCHANGED, deliberately, so
 * existing muscle memory / docs referencing `pnpm test:rls` keep working;
 * only what that script actually runs has grown):
 *   - `src/test/rls/rlsMatrix.test.ts` — cross-org isolation, permission
 *     matrix (Phase 11).
 *   - `src/test/idempotency/createAdvance.test.ts` — Doc 01 §1.11 (Phase 12).
 *   - `src/test/attendance/reconciliation.test.ts` — Doc 01 §1.14.3 (Phase 12).
 *
 * Phase 13: two more suites added, same reasoning, same `test:rls` script
 * name kept unchanged:
 *   - `src/test/soft-delete/restore.test.ts` — Doc 01 §1.16.2 (Phase 13).
 *   - `src/test/rollup/isolation.test.ts` — Doc 01 §1.17.1 "no super-owner"
 *     (Phase 13).
 *
 * Phase 20: one more suite directory added, same reasoning, same
 * `test:rls` script name kept unchanged AGAIN (fourth time this pattern
 * repeats — deliberately, not an oversight; renaming it now would break
 * more muscle memory than it would fix):
 *   - `src/test/sync/pushChanges.test.ts`,
 *     `src/test/sync/pullChanges.test.ts` — Doc 02 §2.11's "Offline
 *     conflicts" row (Phase 20). Both test the RPC/table contract those
 *     two files depend on via the same fixtures pattern as every suite
 *     above, NOT by importing the sync files themselves — see
 *     `src/test/sync/fixtures.ts`'s header for exactly why (both
 *     transitively import `expo-secure-store`, unavailable under this
 *     config's plain-`node` environment).
 *   - `src/test/sync/conflictResolver.test.ts` — same directory, but a
 *     genuine exception to the rule above: `conflictResolver.ts` has zero
 *     runtime RN/Expo imports, so this suite imports and calls the real
 *     module directly. Doesn't need `hasLocalSupabaseEnv()` or a live
 *     instance at all — see that file's own header. It's also the one
 *     sync-engine test actually EXECUTED this phase (via `tsx` against the
 *     real compiled `conflictResolver.ts`, outside this Jest config, since
 *     no local Supabase/Docker was available to run this config's suites
 *     as a whole) — all 5 scenarios passed. Left inside this Jest config
 *     (rather than split into its own always-on suite) so it stays
 *     alongside its two siblings and is picked up automatically once
 *     `pnpm test:rls` is actually runnable end-to-end.
 *
 * Now SIX suites total (across six test files), each with its OWN fixture
 * module except the two `src/test/sync/` RPC-contract suites, which SHARE
 * `src/test/sync/fixtures.ts` — see that file for why it's the one
 * exception to "own fixture module per suite" (both tests in that
 * directory need the exact same graph: an org, an owner, a worker WITH a
 * linked auth account, a project, a vehicle, a dispatch assignment, and a
 * second org for scoping checks — splitting that in two would just
 * duplicate the same fixture-creation code for no isolation benefit,
 * unlike the RLS suite's genuinely-heavier, purpose-specific graph).
 *
 * Why separate from the default config at all:
 *   - Every suite under `src/test/` needs a real local Supabase instance
 *     (`supabase start`) — real network requests, real seconds, unlike the
 *     fast in-process unit tests under `test:` (budget.test.ts,
 *     appVersion.test.ts, mfa.test.ts, etc).
 *   - It must NEVER run as part of the default `pnpm test` — that script
 *     has to stay green (and fast) for anyone without Docker/Supabase CLI
 *     running locally, including CI unit-test jobs that don't stand up a
 *     database. The default config's `testPathIgnorePatterns` excludes
 *     `/src/test/rls/`, `/src/test/idempotency/`, `/src/test/attendance/`,
 *     `/src/test/soft-delete/`, and `/src/test/rollup/` for exactly this
 *     reason.
 *   - It does NOT use the `jest-expo` preset (that preset targets
 *     React Native component rendering, irrelevant here and pulls in a
 *     React Native environment none of these suites need) — plain `node`
 *     is the right environment for suites that only ever call
 *     `@supabase/supabase-js` over HTTP.
 *
 * Run with `pnpm test:rls` from `apps/mobile` after `supabase start`,
 * with `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` /
 * `SUPABASE_SERVICE_ROLE_KEY` set to that local instance's values (see
 * `supabase status` output, or the root `.env.example`). If those aren't
 * set, every suite self-skips with a console warning rather than failing —
 * see each suite's own `hasLocalSupabaseEnv()` guard — so an accidental
 * `pnpm test:rls` run against nothing configured doesn't look like a false
 * failure.
 *
 * Stated as plainly as Phase 11 stated it for the RLS suite alone: NONE of
 * the five suites this config now runs has been executed against a live
 * instance from any session so far — no Docker/local Supabase available.
 * "Written and schema-accurate" is not "passed."
 */

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'db-integration',
  testEnvironment: 'node',
  // Phase 23: tsconfig.json's "@/*" -> "./src/*" path alias was never wired
  // into this config (jest doesn't read tsconfig `paths` on its own). This
  // broke `src/test/sync/conflictResolver.test.ts` specifically — the one
  // suite in this file that imports the real module directly (`@/db/sync/
  // conflictResolver`) and needs no live Supabase instance at all — with a
  // "Cannot find module '@/db/sync/conflictResolver'" failure, unrelated to
  // and hiding behind the live-DB blocker every other suite here has. Found
  // while investigating Item 2 this phase; the default `jest-expo`-preset
  // config (package.json's "jest" block) has the same gap but nothing
  // currently under its scope imports via `@/`, so it hasn't surfaced there
  // yet — worth the same fix if/when it does.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/src/test/rls/**/*.test.ts',
    '<rootDir>/src/test/idempotency/**/*.test.ts',
    '<rootDir>/src/test/attendance/**/*.test.ts',
    '<rootDir>/src/test/soft-delete/**/*.test.ts',
    '<rootDir>/src/test/rollup/**/*.test.ts',
    '<rootDir>/src/test/sync/**/*.test.ts',
  ],
  testTimeout: 30_000,
  // Added Phase 16 — found by actually running this suite for the first
  // time (7 phases after it was first written): every fixtures.ts reads
  // `process.env.EXPO_PUBLIC_SUPABASE_URL`/`...ANON_KEY` (same env vars the
  // real app reads, deliberately, so a real local `supabase start` instance
  // works for both without a duplicate `.env.test`). The root
  // `babel.config.js` uses `babel-preset-expo`, which — regardless of this
  // being a plain-node config with no `jest-expo` preset — rewrites ANY
  // `process.env.EXPO_PUBLIC_*` reference into an import of the special
  // Metro-only module `expo/virtual/env`. Jest's default
  // `transformIgnorePatterns` skips everything under `node_modules`
  // (including that virtual file), so it's left as raw, untranspiled ESM
  // (`export const env = ...`) and CommonJS `require()` chokes on the
  // `export` keyword — this is the "Unexpected token 'export'" failure,
  // identical across all five suites, all of them failing before a single
  // assertion runs. Narrow, surgical fix: let babel-jest transform that one
  // virtual file (same babel-preset-expo config already converts it to
  // CommonJS correctly under Jest, same as it does for the app's own
  // `jest-expo` unit-test config) while leaving every other node_modules
  // package ignored, same as before.
  transformIgnorePatterns: ['node_modules/(?!.*expo/virtual)'],
};
