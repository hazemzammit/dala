# Phase 8 delivery guide — Two-factor authentication

Scope agreed at the start of this phase: build optional per-account 2FA
(Doc 01 §1.15), using Supabase Auth's native TOTP MFA rather than mirroring
Platform Admin's existing custom-column approach (Option B, chosen after
flagging the real security trade-off between the two — see below).

This zip contains **only new/changed files**, repo-relative paths preserved.
`apps/mobile/package.json` is deliberately **not** included — a QR-code
library was added mid-session, then found unnecessary and fully reverted
once Supabase's own `enroll()` response turned out to already return a
ready-to-render SVG (see below), so that file has no net change to ship.

---

## The decision, and why

Before writing anything, this phase surfaced a real fork rather than
guessing: mirror Platform Admin's existing `totp_secret` column (migrations
0009/0021/0023), or use Supabase Auth's own native MFA.

- Platform Admin's implementation stores the TOTP secret in **plain text**
  — its own migration comment (0021) already flags this as needing Vault
  hardening, a known, disclosed weakness in already-shipped code.
- More fundamentally: a custom post-login TOTP check can only ever be a
  **client-side gate** — Supabase issues a fully-valid session at
  `signInWithPassword` regardless of enrolled factors, so a modified
  client could skip a custom check entirely.
- Native MFA's session instead carries a real `aal` (authenticator
  assurance level) claim that GoTrue itself controls — a check against
  `auth.jwt() ->> 'aal'` enforces something the server actually knows.

You picked **Option B (native MFA)**. Platform Admin's TOTP is left
untouched as a separate, legacy mechanism — migrating it too would be a
bigger, cross-cutting change than a mobile-only phase's scope.

---

## What's new

### Database (`supabase/migrations/0029_...sql`)

- `mfa_recovery_codes` table + `generate_mfa_recovery_codes()` /
  `count_unused_mfa_recovery_codes()` RPCs — the one thing native MFA
  doesn't provide out of the box. Generating codes requires the session to
  already be `aal2`.
- `verify_and_consume_recovery_code(p_user_id, p_code)` — **service-role
  only**, explicitly revoked from `authenticated`/`anon`.

**A security finding worth your attention, not just mine to notice and move
past**: Postgres grants `EXECUTE` on new functions to `PUBLIC` by default
unless explicitly revoked. This repo's `0016_default_grants.sql` only
documents _table_-level grants — I could not find a blanket
`revoke ... from public` for functions anywhere in the schema. Every prior
RPC seems to rely in practice on checking `auth.uid()` (which is null for
an anonymous caller) rather than an explicit revoke, so the practical risk
is probably low — but `verify_and_consume_recovery_code` specifically
trusts an explicit `p_user_id` argument with **no** `auth.uid()` check,
which is exactly the shape of function where a PUBLIC-default grant would
matter. It's explicitly locked to `service_role` only here. **I'd recommend
a dedicated pass auditing every RPC's actual grants against the Postgres
default** — genuinely worth doing, but a repo-wide audit is out of
proportion to bundle into this phase silently, so it's flagged here
instead.

### New Edge Function

- **`supabase/functions/mfa-recover/`** — password + recovery code →
  **disables 2FA entirely** (removes every TOTP factor via the admin API),
  rather than attempting to fake an `aal2` session, which Supabase's model
  doesn't support doing safely. This is a real, disclosed trade-off: a
  valid recovery code turns 2FA off, it does not grant one-time entry
  while leaving it on. Needs `SUPABASE_SERVICE_ROLE_KEY` in its
  environment, same as `delete-account` from Phase 7.

### Packages

- `packages/validation/src/mfa.ts` — `totpCodeSchema`,
  `recoveryCodeSchema`, `mfaRecoverSchema`.
- `packages/validation/src/mfa.test.ts` — 11 new tests. Combined with
  Phase 7's 21, **32/32 pass** (re-verified in an isolated sandbox this
  session).

### Mobile

- **`login.tsx`** — after `signInWithPassword`, checks
  `getAuthenticatorAssuranceLevel()`; routes to the new
  `mfa-challenge.tsx` when a factor is enrolled and this session hasn't
  verified it yet.
- **`mfa-challenge.tsx`** (new, top-level route) — 6-digit TOTP entry,
  with a link to lost-authenticator recovery.
- **`mfa-recover.tsx`** (new, top-level route) — re-asks for
  email+password rather than threading the original password through
  navigation state — a deliberate choice for this rare, high-stakes path.
- **`(contractor)/security-settings.tsx`** — the Phase 7 disabled "not
  built yet" row replaced with real enroll / regenerate-codes / disable
  UI. The QR code renders via `react-native-svg`'s `SvgXml` directly from
  Supabase's own `enroll()` response — its `totp.qr_code` field is
  **already a ready-to-render SVG string** (confirmed by reading
  `@supabase/auth-js`'s own type definitions before reaching for a new
  library), so no QR-generation dependency was needed after all.

---

## What I could and couldn't verify myself

- Ran the 32 validation tests (21 from Phase 7 + 11 new) in an isolated
  sandbox — all pass. Same caveat as Phase 7: couldn't run them inside the
  actual pnpm workspace in this session.
- Syntax-checked every new/changed file with `esbuild` — all clean.
  Couldn't run a full `tsc --noEmit` against the real monorepo, or
  actually exercise the enrollment/challenge/recovery flow against a live
  Supabase project (would need a real project with MFA enabled and an
  authenticator app to scan a QR code) — that has to happen in your
  environment.
- Couldn't test the new migration against a real Postgres instance — same
  as every migration delivered this way, checked for balanced
  `$$...$$`/parens by hand, run it against a dev project first.

---

## Manual test checklist

**Migration & function**

- [ ] `0029` applies cleanly.
- [ ] `mfa-recover` deploys with `SUPABASE_SERVICE_ROLE_KEY` set.
- [ ] Spend a few minutes on the RPC-grants finding above, at least for
      `verify_and_consume_recovery_code` — confirm it's actually
      unreachable by `anon`/`authenticated` against your real project
      (`select has_function_privilege('anon', 'verify_and_consume_recovery_code(uuid,text)', 'execute')`
      should return `false`).

**Enrollment**

- [ ] Security settings → Activer → QR code renders and scans correctly
      in an authenticator app (Google Authenticator / Authy).
- [ ] Manual secret entry works as an alternative to scanning.
- [ ] Wrong 6-digit code is rejected with a clear error.
- [ ] Correct code completes enrollment and immediately shows 10 recovery
      codes exactly once.
- [ ] Security settings now shows "Activée" with a remaining-codes count.

**Login with 2FA**

- [ ] Logging out and back in routes through `mfa-challenge.tsx` before
      reaching the dashboard.
- [ ] Wrong code is rejected; correct code proceeds to `next` (or
      dashboard).

**Recovery**

- [ ] "Je n'ai plus accès…" → correct email/password/recovery code signs
      the user in, disables 2FA, and shows the disable confirmation.
- [ ] The same recovery code cannot be used a second time.
- [ ] A wrong recovery code is rejected without revealing whether the
      password was correct.

**Disable / regenerate**

- [ ] Regenerate codes while 2FA is active — old codes stop working, new
      ones are shown once.
- [ ] Disable 2FA — subsequent logins skip the challenge screen entirely.

**Regression**

- [ ] A user who never enrolls 2FA logs in exactly as before Phase 8 (no
      `mfa-challenge.tsx` detour).
- [ ] Platform Admin's own TOTP login is unaffected (separate system, not
      touched this phase).
