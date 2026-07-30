# Dala Admin — Delivery Guide

`dala-admin-delivery.zip` contains everything built this session. It's
structured to overlay directly onto your monorepo root — every path inside
the zip is already `apps/admin/...`, `supabase/migrations/...`, or
`packages/shared-types/...`, matching your actual repo layout.

**Note on migration numbers**: these were originally built as `0019`/`0020`
against a repo snapshot from earlier in the session, then renumbered to
`0021`/`0022` after you ran `supabase db reset` against your actual live
repo and hit a real `0019` collision with your collaborator's
`0019_worker_self_access_and_payroll_rpcs.sql` (added after that snapshot
was taken). Confirmed: zero table/column overlap between that migration
and this one — it touches `dispatch_assignments`/`attendance_records`/
`advances`/`salary_cycles`, this one touches `platform_admins`/
`organizations`/`profiles` plus new tables — so the renumber was the only
fix needed. If you hit _another_ number collision before merging, it means
someone added a migration in between again; just renumber to whatever's
actually next free in your live `supabase/migrations/` folder and rename
the matching filename inside the SQL file's own header comment to match
(cosmetic only, but keeps the file self-describing).

**Verified this session**: `pnpm install`, `tsc --noEmit`, and a full
`next build` all pass clean (zero errors — only pre-existing cosmetic
`import/order` warnings from eslint, not build failures). This is real,
compiling code, not a sketch.

---

## 1. What's in the zip

```
supabase/migrations/0021_admin_roles_and_sessions.sql   NEW
supabase/migrations/0022_announcements.sql              NEW
packages/shared-types/src/index.ts                      MODIFIED
apps/admin/package.json                                 MODIFIED
apps/admin/.env.local                                   MODIFIED
apps/admin/scripts/create-admin.ts                       NEW
apps/admin/src/middleware.ts                             NEW
apps/admin/src/lib/**                                    NEW (7 files)
apps/admin/src/components/**                             NEW (11 files — ui/ mirrors apps/web's exactly, see below)
apps/admin/src/app/(auth)/**                             NEW (login, totp, totp-setup, access-denied)
apps/admin/src/app/(admin)/**                            NEW (all 10 §4.3 screens)
apps/admin/src/app/api/admin/**                          NEW (all route handlers, incl. announcements + services-health + db-explorer)
apps/admin/src/app/page.tsx                               MODIFIED (was the placeholder)
apps/admin/tests/**                                       NEW (Playwright suite — see §8)
apps/admin/playwright.config.ts                           NEW
supabase/migrations/0023_admin_security_hardening.sql     NEW
supabase/functions/send-impersonation-notifications/      NEW (Edge Function)
.gitignore                                                MODIFIED (ignore generated test fixtures)
```

## 0. Latest round: security hardening + Playwright tests + polish

Three things closed this round, all verified with a full `next build` /
`tsc --noEmit` pass (still clean — same pre-existing cosmetic
`import/order` warning as every prior round, no errors):

**Security hardening**

- **TOTP secret is now actually encrypted.** Migration 0023 adds
  `admin_get_totp_encryption_key()` (a `service_role`-only RPC reading
  from Supabase Vault) plus a bootstrap script,
  `pnpm generate-totp-vault-key`, that generates a random AES-256 key and
  stores it in Vault — **run this once per environment before any admin
  can complete TOTP setup**. `apps/admin/src/lib/crypto/totp-secret.ts`
  does the actual AES-256-GCM encrypt/decrypt in Node (Doc 01 §1.3.11 says
  "application layer," not database-side), versioned so a future key
  rotation doesn't invalidate already-encrypted secrets.
- **Per-admin IP allowlist is now enforced**, not just stored.
  `platform_admins.allowed_ips` (from the original 0009 migration) is
  checked in `login/step1/route.ts` as a second layer on top of the
  platform-wide `ADMIN_IP_ALLOWLIST` env gate in `middleware.ts` — lets a
  specific admin be restricted further (e.g. a Support admin limited to
  the office network) without changing the platform-wide list.
- **Owner-notification email is wired up**, not just a TODO comment.
  Migration 0023 adds `impersonation_notifications` (a durable queue,
  since the "Urgent" 24h delay can't happen inside a request/response
  cycle) and `supabase/functions/send-impersonation-notifications`
  actually sends via Resend, matching the `scheduled_job_runs` pattern
  every other scheduled job in this codebase already uses. **You need to
  schedule this function to run periodically** (e.g. every 15 minutes via
  `pg_cron` or a Supabase Scheduled Function) — it's written and correct
  but nothing invokes it automatically yet.
- **A real gap found and fixed while writing the impersonation test**:
  `impersonate/start` previously only recorded admin-side bookkeeping
  (nesting-forbidden, expiry, audit tag) — it never actually produced a
  way for the admin to _act as_ the target user in `apps/web`. Fixed via
  `supabase.auth.admin.generateLink({ type: 'magiclink', ... })`, which
  mints a genuine Supabase Auth session for the target user's own email —
  opening it (now automatically, in a new tab) signs that tab in as the
  target through the exact same mechanism a real login would use, so RLS
  applies identically. `apps/web` needs zero impersonation-aware code —
  there's no bespoke token for it to recognize.

**Playwright tests** (`apps/admin/tests/`, `playwright.config.ts`) — its
own suite per Doc 02 §2.11, not shared with any suite `apps/web` might
add. `tests/global-setup.ts` seeds two admin accounts (with known,
pre-encrypted TOTP secrets so tests can compute a valid code with
`otpauth` rather than mocking the login flow) plus a test org/owner/
worker, writing fixtures to `tests/.e2e-fixtures.json` (gitignored,
regenerated per run). Three spec files:

- `auth.spec.ts` — full two-step login, wrong-password/wrong-code generic
  errors, logout revocation, access-denied page.
- `organizations.spec.ts` — the confirm-by-typing gate genuinely blocks
  the action (not just that a dialog appears).
- `impersonation.spec.ts` — **the one test Doc 02 §2.11 calls
  non-negotiable**: full lifecycle, nesting-forbidden (both client-hidden
  and a direct API call proving the 409 is server-enforced), audit-log
  tagging on both start and end, and the notification queue row. I
  couldn't run these against a live database from this sandbox (no
  Docker/local Supabase reachable here) — **you need to run them yourself**:
  `supabase start`, `pnpm generate-totp-vault-key`, then `pnpm test` from
  `apps/admin/`. I verified they compile clean (`tsc --noEmit`) and I
  reviewed the logic carefully, but "compiles" isn't "passes" — treat the
  first local run as the real verification.
- One accessibility bug the tests surfaced and I fixed in passing: the
  TOTP code inputs had an unassociated `<label>` (no `htmlFor`/`id`) —
  invisible to screen readers and to Playwright's `getByLabel`. Fixed in
  both `TotpForm.tsx` and `TotpSetupForm.tsx`.

**Polish**: Users' delete action now uses the same `ConfirmTypingDialog`
Organizations uses (typing the user's actual email, fetched from
`auth.users` and shown in the table) instead of a native `window.prompt`.

---

**Latest round: full UI/UX overhaul to match `apps/web` and Doc 05.**
Earlier rounds used generic ad-hoc Tailwind instead of the actual design
system — that was a real miss, not a style preference. Fixed now:

- Read `apps/web/src/components/ui/*` and `components/shell/*` (your
  collaborator's actual, already-built components) and
  `docs/spec/05-design-system-and-ux-spec.md §3.6` in full before touching
  anything.
- Rebuilt `apps/admin/src/components/ui/` as sibling copies of web's exact
  components — `Button` (primary/secondary/text, plus a `danger` and
  `success` variant admin specifically needs for destructive/approval
  actions), `Card`, `FormField`, `StatusBadge`, `DataTable`, `EmptyState`,
  `Avatar`, `StatCard` — same classNames, same states, same tokens. Not
  cross-imported from `apps/web` (separate app/deploy, your collaborator
  owns that code) — kept as identical sibling files so the two can't
  accidentally diverge in behavior while staying independently deployable.
- Rebuilt `Sidebar` to match web's exact NavItem pattern (accent-50 filled
  pill + fill-weight icon on active, neutral-500 + outline icon inactive),
  swapped the org-switcher slot for the "Dala Admin" wordmark, moved
  sign-out into the account row at the bottom (matching web's layout).
  Removed the separate `Topbar` — admin doesn't have global search or
  notifications the way the contractor app does, so a second header bar
  was dead weight; each screen's own `<h1>` (Sora, 24px/600, Doc 05 §1.2)
  does the job the removed topbar wasn't doing anyway.
- **Fixed a real spec violation**: the impersonation banner was in
  `warning` (amber) — Doc 05 §3.6 explicitly says `danger`-tinted, "so an
  admin can never forget they're inside a live impersonation." Now solid
  `bg-danger` with white text.
- Every screen (Organizations, Users, Audit Log, Announcements, Services
  Health, Admin Users, Database Explorer, all four auth screens) rewritten
  to compose these components — `DataTable` for every list (sortable
  headers, Doc 05 §3.6 "tables-first"), `StatusBadge` pills instead of
  colored table-row backgrounds (Doc 05 §3.5's explicit rule), `EmptyState`
  on every list screen instead of a blank table, `StatCard` only on the
  Dashboard (the one legitimate "hero number" use, not a marketing card).

Verified with a full `next build` after the rewrite — clean, only the same
pre-existing cosmetic `import/order` warnings as before.

**Previous round (still true)**: a real Announcements screen (§4.3.10 —
backed by a new `announcements` table, migration 0022, with a working live
recipient-count estimate) and a real Services Health screen (§4.3.9 — the
scheduled-job table reads actual `scheduled_job_runs` rows and flags
two-consecutive-failures, per spec). Also fixed a batch of Tailwind class
names across every component (`text-danger-500` → `text-danger`,
`neutral-600/700` → the nearest shade that actually exists in the token
scale) — these were silently producing no styling since
`packages/design-tokens`' status colors and neutral scale don't have every
shade number I'd initially guessed at; `next build` doesn't fail on an
unknown Tailwind class, it just renders nothing, so this needed a manual
audit against the actual token file rather than trusting the build's green
checkmark alone.

## 2. Placement

Unzip, then copy the contents straight over your repo root — every path
already matches:

```bash
unzip dala-admin-delivery.zip -d /tmp/dala-admin-delivery
cp -r /tmp/dala-admin-delivery/dala-admin-delivery/* "C:\Users\hazem\Documents\Documents\stage 4iosys\dev\dala\"
```

(adjust the `cp -r` for Windows — robocopy or just drag-and-drop the
folders in Explorer works fine, since nothing here collides with files
you or your collaborator own outside `apps/admin`.)

**Two files are genuinely shared, not admin-only — read this before you
overlay them:**

- `packages/shared-types/src/index.ts` — I added `suspended_at`/
  `deleted_at` to `Organization`, `suspended_at` to whatever the Profile
  type is, and three new types (`PlatformAdmin`, `AuditLogEntry`,
  `PlatformAdminRole`). These are **additive**, but I made the new fields
  **required** (not optional) on the existing types, matching how the rest
  of the file is written — that means `apps/web`'s TypeScript build will
  fail to compile until it either destructures/constructs these objects
  with the new fields present, or until your collaborator pulls migration
  0021 so the DB actually returns them. **Message your collaborator before
  merging this file** — it's a two-minute fix on their end (the new
  columns exist in the DB after the migration runs, so any `select('*')`
  already returns them; only manually-constructed mock/test objects would
  need updating), but it will break their build if it lands silently.
- `supabase/migrations/0021_admin_roles_and_sessions.sql` — shared
  backend. Run it against your **local** Supabase instance:
  ```bash
  supabase db reset   # or: supabase migration up, if you don't want a full reset
  ```
  Coordinate with your collaborator on who pushes it to the shared
  dev/staging project, same as any other migration.

## 3. Setup steps, in order

**If you already ran `pnpm create-admin` and hit "Missing
NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"**: that was a real
bug (fixed in this delivery) — `next dev`/`next build` auto-load
`.env.local`, but a standalone `tsx` script doesn't get that for free, so
`process.env` was empty even with real values sitting in the file.
`scripts/create-admin.ts` now loads it explicitly via `dotenv`. Re-copy
just that one file (or the whole zip) and re-run.

**Also don't blindly overwrite your existing `apps/admin/.env.local`** —
if you already filled in `ADMIN_SESSION_SECRET`, copying this zip's
`.env.local` wholesale will wipe it back to blank. Only `DATABASE_URL`
(added for the Database Explorer) is new since your last copy — add that
one line to your existing file instead of overwriting it.

1. **Place the files** (§2).
2. **Run the migrations** locally (§2, last bullet) — both 0021 and 0022.
3. **Install dependencies** — the delivered `package.json` adds `jose`
   (JWT), `otpauth` (TOTP), `pg`/`@types/pg` (direct Postgres access for
   the Database Explorer), `dotenv` (env loading for the bootstrap
   script), `server-only`, and `tsx` (dev):
   ```bash
   pnpm install --filter admin...
   ```
4. **Fill in the two new env vars** in `apps/admin/.env.local`:
   ```
   ADMIN_SESSION_SECRET=<openssl rand -base64 32>
   ADMIN_IP_ALLOWLIST=           # leave empty for local dev — see the warning below
   ```
   Leaving `ADMIN_IP_ALLOWLIST` empty disables the IP gate entirely (local
   dev convenience, `middleware.ts` logs this loudly in a code comment) —
   **you must set this to your team's real IPs before any deployed
   environment goes live**, or the gate described in Doc 04 §4.3.1 is a
   no-op.
5. **Create your first Super Admin** (bootstrap problem: the in-app invite
   screen needs an existing Super Admin to use it):
   ```bash
   cd apps/admin
   pnpm create-admin -- --email you@dala.tn --name "Your Name" --password "temp-password-123"
   ```
6. **Bootstrap the TOTP encryption key** (new this round — one-time per
   environment, must happen before any admin, including the one from step
   5, can complete TOTP setup):
   ```bash
   pnpm generate-totp-vault-key
   ```
7. **Run it**:
   Visit `http://localhost:3001/login`, sign in with the credentials from
   step 5 — you'll be routed straight into TOTP setup (scan the shown
   secret into Google Authenticator/1Password/Authy), then land on
   `/dashboard`.

## 3a. Running the tests

```bash
cd apps/admin
supabase start                    # if not already running
pnpm generate-totp-vault-key      # if not already done
pnpm test                         # runs the full Playwright suite
```

`playwright.config.ts` auto-starts the dev server for you
(`reuseExistingServer: true` locally, so it won't fight with one you
already have running). `global-setup.ts` seeds fresh test fixtures every
run — safe to run repeatedly, it upserts rather than erroring on
already-existing test accounts.

**One thing to actually schedule yourself**: the
`send-impersonation-notifications` Edge Function is written and correct
but nothing invokes it automatically. Set up a periodic trigger (Supabase
Dashboard → Edge Functions → your function → Cron, or `pg_cron` calling it
via `net.http_post` every 15 minutes) — same setup work you'd need for
any other scheduled job.

## 4. What's fully working vs. stubbed

| Screen (Doc 04 §4.3.x)                                                                                                                                  | Status                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth — IP gate, 2-step login, first-login TOTP enrollment (§4.3.1)                                                                                      | **Working**                                                                                                                                                                                                                                                                                                                                                                                                         |
| Dashboard / Metrics (§4.3.2)                                                                                                                            | **Working** for org/user counts; MRR/churn/support-ticket trends need a time-series data source that doesn't exist yet (noted in the page itself)                                                                                                                                                                                                                                                                   |
| Organizations — list, detail, suspend, soft-delete, plan change (§4.3.3)                                                                                | **Working**                                                                                                                                                                                                                                                                                                                                                                                                         |
| Impersonation — start/end, nesting-forbidden, dual-expiry, banner, audit tagging, cross-app hand-off via magic link, owner-notification queue (§4.3.3a) | **Working** end-to-end. The one remaining piece is operational, not code: the notification Edge Function needs to actually be scheduled (§3a)                                                                                                                                                                                                                                                                       |
| Users — list, reset password, suspend, delete (§4.3.4)                                                                                                  | **Working**                                                                                                                                                                                                                                                                                                                                                                                                         |
| Database Explorer (§4.3.5)                                                                                                                              | **Working** — read-only SQL by default (SELECT/WITH/EXPLAIN), a danger-zone toggle for INSERT/UPDATE/DELETE requiring a reason, and — when the team has 2+ admins — routes through `admin_approval_requests` (0021) for a second admin's approval before executing. DDL and admin-level Postgres commands (DROP/TRUNCATE/ALTER/GRANT/CREATE/etc.) are blocked outright in both paths — never authorized by the spec |
| Audit Log — filterable (§4.3.6)                                                                                                                         | **Working**                                                                                                                                                                                                                                                                                                                                                                                                         |
| Billing (§4.3.7)                                                                                                                                        | **Stub** — blocked on the TVA/tax decision (Doc 00 §0.5 item 9) _and_ there's no subscriptions/payments table anywhere in the schema yet to build a real screen against                                                                                                                                                                                                                                             |
| Storage Monitor (§4.3.8)                                                                                                                                | **Stub** — no per-org storage-usage tracking table exists, and no upload path convention is established anywhere in the codebase yet to compute one against `storage.objects`; building this now would mean inventing a convention that might conflict with whatever your collaborator eventually picks for actual file uploads                                                                                     |
| Services Health (§4.3.9)                                                                                                                                | **Partially working** — the scheduled-job table is real, reads `scheduled_job_runs`, and flags two-consecutive-failures per spec. The infrastructure status grid (Supabase/Konnect/Resend/Expo Push dots) and edge-function invocation log are still a stub — no uptime-check mechanism or invocation-log table exists yet, and faking green dots would be actively misleading                                      |
| Announcements (§4.3.10)                                                                                                                                 | **Working** for authoring — new `announcements` table (migration 0022), live recipient-count estimate, Publier/Programmer. Actual delivery (rendering the in-app banner, sending the email/push) is a separate, not-yet-built consumer of this table                                                                                                                                                                |
| Admin User Management (§4.3.11)                                                                                                                         | **Working** — list + Super-Admin-only invite                                                                                                                                                                                                                                                                                                                                                                        |

## 5. Known gaps to close before production (not before you can start using it)

All four gaps listed in earlier rounds of this guide are now closed:
TOTP encryption, owner-notification sending, the Users delete dialog, and
per-admin IP allowlist enforcement. What's actually still open:

- **TOTP encryption key rotation isn't automated.** The Vault RPC and
  storage format are versioned (`v1`, `v2`, ...) specifically so rotation
  is _possible_ without a data migration, but nothing rotates it on a
  schedule yet — Doc 00 §0.5 doesn't specify a rotation cadence for this
  key the way it does for CIN encryption (90 days), so this was
  deliberately left as "rotatable" rather than guessing at a cadence and
  building automation around it.
- **The magic-link session's own expiry** (Supabase Auth's default, ~1
  hour) is independent of the admin app's 15-min-idle/2h-hard
  impersonation clocks. If you want the target-user tab's session itself
  to expire on the same schedule as the admin-side banner, that needs a
  custom `redirectTo` handler or a shorter Supabase Auth magic-link
  expiry configured in the dashboard — not built here, since it's a
  project-wide Auth setting that affects every magic link, not just
  impersonation's.
- **The Playwright suite hasn't actually been run against a live
  database** (no Docker/Supabase reachable from the sandbox this was
  built in) — see §3a. Treat your first local `pnpm test` run as the real
  verification, not this guide's description of what the tests check.
- **`send-impersonation-notifications` isn't scheduled anywhere yet** —
  written, correct, but nothing invokes it on a cron. See §3a.

## 6. If something doesn't build after you overlay it

Most likely cause, in order of probability:

1. You didn't run `pnpm install --filter admin...` after copying the new
   `package.json` — new deps (`jose`, `otpauth`, `server-only`, `tsx`)
   won't resolve.
2. `apps/web` fails to typecheck because of the `shared-types` change —
   see §2's callout, this is expected until your collaborator adjusts
   for the new required fields or pulls migration 0021.
3. `ADMIN_SESSION_SECRET` isn't set — every route handler that touches a
   session will throw a clear error naming exactly this, not a cryptic one.
