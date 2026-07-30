# Phase 9 delivery guide — RPC-grants audit, org-member invite-by-email, Jest/Detox infra

Scope agreed at the start of this phase, in priority order: (1) the RPC
public-grants audit Phase 8 flagged and left open, (2) the org-member
invite-by-email pipeline cut from Phase 7, (3) a conservatively-scoped
slice of Doc 02 §2.11's test matrix, and (4) the project-detail tab hub
only if 1–3 left room (they didn't).

Unlike prior phases' delivery guides, most of what follows was actually
**run**, not just written and syntax-checked — `pnpm install` and a real
Postgres instance weren't available, but the JS/TS side (validation
package, shared-types, the whole mobile app) was installed via `pnpm`
and its tests/typecheck were genuinely executed. Where something wasn't
verified, that's called out explicitly below rather than implied.

This zip contains **only new/changed files**, repo-relative paths
preserved.

---

## 1. RPC public-grants audit

Went through every `SECURITY DEFINER` function across all 29 prior
migrations (not just the ones added since Phase 8) and checked its
actual grant state by reading each migration's own `grant`/`revoke`
statements. Result: **23 of 24 already had one** — Phase 8's flagged
concern turned out to be smaller than worried, once actually checked
rather than carried forward as an assumption.

The one real gap: `is_shared_site_log_file(text)` (added in 0025 to back
a `storage.objects` SELECT policy) had no explicit grant, so it sat at
Postgres's `PUBLIC EXECUTE` default. An unauthenticated (`anon`) caller
could invoke it directly via `supabase.rpc(...)` and get a true/false on
whether an arbitrary storage path string is referenced by a `site_logs`
row — a minor existence-oracle, not a file-content leak (storage
policies still gate the actual file), but not intentional and not
needed (the storage policy only ever needs `authenticated` to call it).

Fixed in `0030_phase9_rpc_grants_and_org_member_invitations.sql`'s Part 1:

```sql
revoke execute on function is_shared_site_log_file(text) from public, anon;
grant execute on function is_shared_site_log_file(text) to authenticated;
```

The plain `SECURITY INVOKER` predicate/soft-delete functions
(`is_org_member`, `org_role_of`, `is_project_member`, `is_own_worker`,
`is_org_participant`, `soft_delete_project`/`restore_project`,
`soft_delete_organization`/`restore_organization`,
`soft_delete_worker`/`restore_worker`, `search_all`) were checked and
confirmed **not** to need a grant fix — they run under the calling
user's own privileges (not a bypass role), so the existing table grants
(0016) and RLS policies already gate them correctly regardless of who
can call the function itself.

---

## 2. Org-member invite-by-email (Doc 03 §3.23, cut from Phase 7)

### Database (`0030_phase9_rpc_grants_and_org_member_invitations.sql`, Part 2)

- `organization_member_invitations` table — mirrors `worker_invitations`
  (0004) one level up (org-to-user instead of org-to-worker). `role` is
  constrained to `manager`/`viewer` — deliberately excludes `owner` (see
  the migration's own comment for why ownership transfer isn't part of
  this pipeline).
- RLS: any current org member can see the org's pending/past invitations
  (same transparency `worker_invitations` already gives); only the owner
  can create or edit one.
- `invite_organization_member(org_id, email, role)` — owner-only,
  `SECURITY INVOKER` (a convenience upsert, not a permission bypass).
  Upserts by `(org_id, lower(email))`, so re-inviting the same address
  regenerates the token and resets the 7-day expiry rather than creating
  a duplicate row.
- `get_organization_member_invitation_by_token(token)` — anon-safe,
  `SECURITY DEFINER`, mirrors `get_worker_invitation_by_token` (0017) /
  `get_project_invitation_by_token` (0024).
- `accept_organization_member_invitation(token)` — existing-account
  path, `SECURITY DEFINER`. Verifies the accepting session's own JWT
  email (`auth.jwt() ->> 'email'`, matching this repo's existing
  precedent from 0029 rather than the unused `auth.email()` helper)
  matches the invited address before writing `organization_members` —
  this is real access control (without it, any logged-in account could
  accept any invitation token it got hold of), not a courtesy check.

### New Edge Function

`supabase/functions/accept-organization-invitation/` — the no-account
path. Deliberately mirrors `accept-worker-invitation`'s shape (service
role, invite-channel-is-identity-proof, `email_confirm: true`, no
separate verification step) rather than `sign-up`'s, because unlike
`sign-up` this must **not** create a new organization — the person is
joining an existing one as manager/viewer.

### Packages

- `packages/validation/src/organizations.ts` —
  `inviteOrganizationMemberSchema` (rejects `role: 'owner'` by
  construction) and `organizationMemberSetPasswordSchema`.
- `packages/validation/src/organizations.test.ts` — 7 new tests (18 total
  in this file now).
- `packages/shared-types/src/index.ts` — `OrganizationMemberInvitation`.

### Mobile

- `(contractor)/team-members.tsx` — the "bientôt disponible" placeholder
  row replaced with a real invite sheet (email + manager/viewer
  SegmentedControl) and a pending-invitations list, gated to `isOwner`
  (matching the RLS insert policy).
- `accept-organization-invite.tsx` (new, top-level route) — three-way
  branch matching `accept-org-invite.tsx`'s existing shape: already
  logged in (accept directly via RPC) / has an account but isn't logged
  in (routes to `login.tsx` with a `next` param, returns here) / no
  account (inline password form on this same screen, calling the new
  Edge Function — **not** a redirect to `sign-up.tsx`, since that screen
  always creates a brand-new organization).

### Deliberate scope cut, stated plainly

Actually **sending** the invitation e-mail isn't built — same disclosed
boundary as the existing worker-invite WhatsApp/SMS gap
(`team.tsx`'s own header comment already states delivery is a
backend/notification-service concern not built yet). The invitation row
and the accept screen both work; a human currently has to copy/share the
`dala://accept-organization-invite?token=...` link manually. The invite
sheet's own copy says this outright.

---

## 3. Jest + Detox infrastructure (Doc 02 §2.11, scoped conservatively)

§2.11's table names Jest unit coverage, Detox e2e for several specific
flows, an RLS permission matrix, idempotency integration tests, an
offline-conflict Detox test, and attendance/expense integration tests —
read in full before committing to anything here, and it's genuinely
**two phases of work**. What shipped this phase, and why:

### Jest — stood up from nothing

`apps/mobile` had zero test infrastructure before this phase — not "zero
tests against existing infra," a `"test": "detox test"` script pointing
at a Detox config that didn't exist either. Added as real
devDependencies: `jest`, `jest-expo` (`~54.0.17`, matching this repo's
Expo SDK 54), `@testing-library/react-native`, `@types/jest`. Config
lives in `apps/mobile/package.json`'s `"jest"` block (`preset:
"jest-expo"`).

**Found and fixed a real monorepo bug getting this far**: running Jest
for the first time surfaced
`ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './helpers/callSuper' is
not defined by "exports"` from inside `react-native`'s own jest setup —
a hoisted `@babel/runtime@7.21.0` too old for what RN 0.81.5's preset
needs. Fixed with a root-level `pnpm.overrides` pin
(`"@babel/runtime": "^7.25.0"` in the workspace root `package.json`, not
`apps/mobile`'s — pnpm warns, correctly, that per-package overrides
outside the root don't take effect). Confirmed the fix by checking the
resolved version in `node_modules/.pnpm/node_modules/@babel/runtime` before
and after.

**Coverage added**, chosen deliberately for what's genuinely testable
without a live backend:

- Extracted the expenses screen's consumed-% calculation out of an
  inline `useMemo` into `lib/budget.ts` (`calculateConsumedTotal`,
  `calculateConsumedPercent`) — this is exactly the kind of thing §2.11's
  "expense/budget calculation" row asks for, and it wasn't testable
  before because it lived inline inside a component. `expenses.tsx` now
  just calls the extracted functions. `budget.test.ts` — 6 tests
  (sum, string-coercion, empty list, null/undefined/zero budget, capping
  at 100%, rounding).
- `appVersion.test.ts` — 9 tests on `checkAppVersion`, covering §2.11's
  "app version gate" row directly: normal mapping, `force_update: true`,
  and — the one behavior actually worth pinning — the **fails-open**
  guarantee (Doc 03 §3.1: a network error or thrown exception must
  return `forceUpdate: false`, never lock out an already-installed
  offline user).
- **Ran it**: `pnpm --filter mobile test` → **15/15 pass**.
  `pnpm --filter mobile typecheck` and `pnpm --filter @dala/validation
test`/`typecheck` also run clean (39/39 validation tests, up from 32).

### Detox — actually configured, not just present

- `.detoxrc.js` — iOS simulator + Android emulator build/device configs.
  This is an Expo-managed (expo-router) project with no checked-in
  native folders, so both configs assume a one-time local
  `npx expo prebuild` (regenerable output, not a permanent eject) before
  `pnpm test:e2e:build`.
- `e2e/jest.config.js` — deliberately **separate** from the unit-test
  Jest config in `package.json` (different test environment —
  `detox/runners/jest/testEnvironment`, not `jest-expo`'s). Mixing the
  two is the most common way teams break both.
- `e2e/twoFactorAuth.e2e.ts` — §2.11's named "2FA enrollment/login" flow:
  enroll → logout → login-with-TOTP, then a cleanup step that disables
  2FA again so the seeded test account is clean for the next run.
- `e2e/totp.ts` — a small helper using `otplib`'s v13 functional API
  (`generateSync`) to compute a **real** currently-valid 6-digit code
  from the enrollment secret read directly off-screen
  (`security-2fa-manual-secret`'s rendered text), rather than only ever
  being able to test the wrong-code error path.
- Added `testID`s to every screen this flow touches — none existed
  anywhere in the app before this phase: `login-email-input`,
  `login-password-input`, `login-submit-button`, `bottom-nav-plus`,
  `plus-sheet-settings`, `settings-security-row`,
  `security-2fa-enable-button`, `security-2fa-manual-secret`,
  `security-2fa-enroll-code-input`, `security-2fa-confirm-enroll-button`,
  `security-2fa-codes-continue-button`, `security-2fa-disable-button`,
  `settings-logout-row`, `mfa-challenge-code-input`,
  `mfa-challenge-verify-button`.

**Not run against a real simulator/emulator in this delivery** — no
device or emulator is available in the sandbox this was built in. It
typechecks cleanly (`pnpm --filter mobile typecheck` passes with the new
`e2e/*.ts` files included), and the logic was checked carefully by hand
against Detox's and otplib's actual v13 type definitions (an earlier
draft used otplib's old v11/v12 `authenticator` singleton API, which
doesn't exist in the v13 that's actually on npm — caught by running
`tsc`, not assumed correct). But "written and typechecks correctly" and
"confirmed passing against a real build" are different claims, and only
the first one is true yet — see the manual test checklist below for
what running it for real requires.

### Explicitly left for a follow-up phase, not attempted here

The RLS permission matrix, idempotency integration tests, the
offline-conflict Detox test, and attendance-reconciliation integration
tests. Each needs seeded test-data infrastructure (a way to spin up
known org/project/worker rows and tear them down) that doesn't exist
anywhere in this repo yet. Building that alongside everything else this
phase would have meant cutting corners on all of it — the outcome this
phase was explicitly scoped to avoid.

---

## Bonus fix: pre-existing typecheck break, found and fixed

Getting `pnpm --filter mobile typecheck` to a clean baseline (so this
phase's own new files could be checked against a real signal, not noise)
surfaced a **pre-existing** error, unrelated to this phase:
`<ArrowLeftIcon size={20} onPress={() => router.back()} />` — Phosphor
icon components don't accept an `onPress` prop — broken identically
across 5 screens (`delete-account.tsx`, `organization-settings.tsx`,
`profile-settings.tsx`, `security-settings.tsx`, and the pre-Phase-9
`team-members.tsx`). Fixed using the pattern this codebase already uses
correctly elsewhere (`notification-settings.tsx`: wrap the icon in an
`XStack` that carries the `onPress` and `accessibilityRole`/
`accessibilityLabel`). `pnpm --filter mobile typecheck` now passes with
zero errors across the whole app, not just this phase's new files.

---

## What I could and couldn't verify myself

**Actually ran, this time** (unlike prior phases' delivery guides, where
this section mostly listed what a sandbox couldn't do):

- `pnpm install --filter <pkg>...` for `@dala/validation`,
  `@dala/shared-types`, and `mobile` — all installed cleanly (peer-dep
  warnings about `react-native-reanimated`/`react-native-worklets`
  wanting a newer RN than 0.81.5, and `@types/react-dom` wanting React
  18, are pre-existing and unrelated to this phase).
- `pnpm --filter @dala/validation test` → 39/39 pass.
  `pnpm --filter @dala/validation typecheck` → clean.
  `pnpm --filter @dala/shared-types typecheck` → clean.
- `pnpm --filter mobile test` → 15/15 pass.
  `pnpm --filter mobile typecheck` → clean (after the bonus fix above).

**Still couldn't verify** — no Postgres or live Supabase project in this
sandbox:

- Migration `0030` was never run against a real database. Checked by
  hand for balanced `$$...$$`/parens and consistent naming against the
  real schema (organization_members' actual column names, etc.), but
  that's not the same as `supabase db push` succeeding.
- The RPC-grants audit's conclusions are based on reading migration SQL
  text, not on running the verification query
  (`select p.proname, has_function_privilege('anon', p.oid, 'execute')
...`) against a live project. Please run it for real — see the
  checklist below — the audit could be wrong if some migration's grant
  statement never actually applied for an unrelated reason.
- The Detox spec (above) has never executed against a real
  build/simulator.

---

## Manual test checklist

**Migration & RPC grants**

- [ ] `0030` applies cleanly (after `0029`).
- [ ] Run the verification query from the original brief against the
      real project and confirm `is_shared_site_log_file` now shows
      `anon_can_call = false`:
      `sql
  select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_call
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' order by 1;
  `
      Spot-check a few of the "already fine" ones too (e.g.
      `find_user_id_by_email` should show `false` for both `anon` and
      `authenticated`).
- [ ] `accept-organization-invitation` deploys with
      `SUPABASE_SERVICE_ROLE_KEY` set.

**Org-member invite — existing-account path**

- [ ] As an org owner, Team Members → Inviter un membre → enter an email
      that already has a Dala account under a different org → Envoyer.
- [ ] Log in as that other account, open
      `dala://accept-organization-invite?token=...` (share the token
      manually — no email is sent yet) → should show "already logged
      in" branch → Accepter → should land on this org's dashboard, with
      the new org now visible in the org switcher.
- [ ] Try accepting a token while logged in as a _different_ account
      than the invited email → should show the email-mismatch error, not
      silently succeed.

**Org-member invite — no-account path**

- [ ] Invite a brand-new email address.
- [ ] Open the accept link while logged out → choose "Créer un compte" →
      set a password → should sign in automatically and land on the
      dashboard as a manager/viewer of that org (not owner, and not with
      a new org created for them).

**Org-member invite — edge cases**

- [ ] Re-invite the same pending email with a different role → old
      invitation's role/token/expiry update in place, no duplicate row.
- [ ] Open an expired or already-accepted token → correct
      expired/already-accepted screens, not a generic error.
- [ ] As a manager or viewer (not owner), confirm the "Inviter un
      membre" button doesn't appear on Team Members.

**Jest (mobile)**

- [ ] `pnpm --filter mobile test` → 15/15 pass.
- [ ] `pnpm --filter mobile typecheck` → clean.
- [ ] `pnpm --filter @dala/validation test` → 39/39 pass.

**Detox — needs local setup this delivery couldn't do**

- [ ] `npx expo prebuild` (generates `ios/`/`android/` — one-time, or
      after any native-config change).
- [ ] Seed a test account with **no** 2FA factor enrolled; set
      `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` env vars to its credentials.
- [ ] `pnpm --filter mobile test:e2e:build` then
      `pnpm --filter mobile test:e2e` (iOS simulator by default; add an
      `android.emu.debug` run too if you want Android coverage).
- [ ] Confirm the spec passes end-to-end: enroll, forced logout, TOTP
      challenge on the next login, cleanup disables 2FA again so the
      seeded account is reusable.

**Regression — the bonus fix**

- [ ] Back button still works and looks the same on: Delete Account,
      Organization Settings, Profile Settings, Security Settings, Team
      Members.
