# Admin Implementation Status — Dala (Chantier OS)

> **Note on this file**: it did not exist anywhere in the repo before this
> pass — checked `docs/` first (same convention `MOBILE_IMPLEMENTATION_
STATUS.md` itself set) and found nothing. Created fresh to track the
> admin-app remediation effort run against a tiered audit/remediation plan
> for `apps/admin` (an external planning document, not itself checked into
> this repo), not a general history of the admin app going back to its
> first migration.

Scope: `apps/admin` (Platform Admin), plus the handful of `supabase/
functions/` and `packages/shared-types` changes that admin work required.
Mobile/web are out of scope for this document — see
`MOBILE_IMPLEMENTATION_STATUS.md` for that surface.

Migrations referenced below: `0054`–`0068`. Next free migration number
for whoever picks this up next: **`0069`**.

---

## Tier 1 — Fast wins (backend already existed)

**Shipped**, all three.

- **1.1 Soft-delete restore UI** (`0054`) — Restaurer button on
  `OrganizationDetail`, Super-Admin-only, disabled past the 30-day
  `restore_organization()` window. `org.restore` added to the audit log's
  1-year security-event retention tier.
- **1.2 Locked-out admin TOTP re-provisioning** (`0055`) — new
  `api/admin/admins/[adminId]` route, `reset_totp` action clears
  `totp_secret`/`totp_enabled` so the affected admin re-enrolls through
  the existing first-login flow. Needed a dedicated `adminResetTarget`
  test fixture — the existing admin fixtures are shared login state for
  the rest of the suite and can't be de-enrolled mid-run.
- **1.3 Realtime added to the Services Health infra grid** (`0056`) —
  `ping-service-health` opens a Realtime channel and waits for
  `SUBSCRIBED`/timeout(3s); Konnect stays deliberately unmonitored (no
  real integration to ping — see `0032`'s own header).

---

## Tier 2 — Real backend gaps

**Shipped**, all seven. Two real, pre-existing bugs were found and fixed
along the way — flagged here the same way `MOBILE_IMPLEMENTATION_STATUS.md`
flags the worker-RLS bug class it hit in Phases 1–3.

- **2.1 Edge Function invocation log** (`0057`) — `edge_function_
invocations` table + `supabase/functions/_shared/logInvocation.ts`,
  wrapping 7 user-triggered functions (`send-organization-invitation-
email`, `send-project-invitation-email`, `generate-report`,
  `export-org-data`, `mfa-recover`, `delete-account`, `payment-webhook`).
  Distinct from `scheduled_job_runs` — that table only ever gets a row
  from a cron tick; this is the "synchronous, user-triggered" half that
  had no log at all before.
- **2.2 Announcement delivery** (`0058`) — in-app banner on both
  `apps/web` (`AnnouncementBanner.tsx` + `AppShell.tsx`) and `apps/mobile`
  (same component name, mounted in the root layout below `OfflineBanner`
  — stacking order is a deliberate choice, not arbitrary, see that
  file's header) — plus a real email channel in
  `send-announcement-notifications`. **The `apps/web` piece touches code
  owned by whoever maintains that app — get it reviewed before merging**,
  same as any cross-owner change.
- **2.3 Admin login/logout as audit_log rows** (`0059`) — `admin.login`
  logged in `login/step2`, `admin.logout` logged in `logout` (reading a
  full session context _before_ revoking, so there's still a valid ctx to
  log against).
- **2.4 Missing Playwright specs** — `dashboard.spec.ts` and
  `audit-log.spec.ts` added (the two screens that had no coverage at
  all). **Writing these surfaced a real bug**, not a hypothetical one:
  🔴 **`audit_log.actor_id` referenced the wrong table** (`0009` pointed it
  at `profiles(id)`; the only real writer, `logAdminAction()`, always
  passes a `platform_admins.id`) — every audit-log insert in the entire
  app had been silently failing an FK check since `0009`, meaning **no
  admin action had ever actually been recorded** despite every route
  believing it was logging correctly (`logAdminAction` catches and swallows
  the error by design, so a broken write never blocked the real action).
  Fixed in `0060` by dropping the FK — `actor_type` is a 3-way enum
  (`user`/`platform_admin`/`system`), so no single FK could ever be
  correct for all three; audit tables conventionally skip a hard actor FK
  for exactly this reason anyway. **Caveat**: the actual `pnpm test` run
  against a live Supabase instance was never executed in the environment
  this work was done in — every migration/route was verified by direct
  SQL/logic review and `tsc`-level reasoning, not a confirmed green CI
  run. Run it for real before trusting this tier fully.
- **2.5 App-version / forced-update admin screen** (no migration needed)
  — `/app-versions`, Super Admin + Admin write, no "N users affected"
  count shown (no client-reported-version column exists anywhere in this
  schema — checked before assuming otherwise; the UI says so and points
  to Sentry/App Store Connect/Play Console instead of fabricating a number).
- **2.6 CI pipeline** — see the "CI" section below; this item's actual
  shape changed after this status doc was first drafted, once your own
  `.github/workflows/ci.yml` (a monorepo-wide turbo pipeline, not per-app
  workflows) turned out to already exist.
- **2.7 TOTP encryption key rotation** (`0061`) — `rotate-totp-
encryption-key` Edge Function, `totp_key_rotation_log` +
  `totp_encryption_key_state`, twice-yearly cron. 🔴 **Second real bug
  found while designing this**: `totp-secret-core.ts` hardcoded
  `CURRENT_KEY_VERSION = 'v1'` as a TS constant — a rotation job that only
  rotated key material and re-encrypted existing rows (which is all the
  plan's own step list described) would have "rotated" in name only,
  since every _new_ encryption after that point would keep silently using
  the old hardcoded version forever. Fixed by making "current version for
  new writes" a DB value (`admin_get_current_totp_key_version()`) the
  rotation job actually flips, only after every existing admin has been
  successfully re-encrypted — a partial failure leaves everyone exactly
  as they were, nobody locked out.

---

## Tier 3 — Konnect payment integration

**Not started — explicitly blocked**, not deprioritized. The plan itself
names this as needing real Konnect merchant sandbox credentials before
any of it is buildable or testable; writing speculative integration code
against an assumed API shape for something that moves real money would be
worse than leaving it undone. `paymentProvider.ts`'s Konnect branch is
still a stub that throws — pick this up once credentials exist.

---

## Tier 4 — UX/operational polish

**9 of 10 shipped**, one intentionally split into two phases.

- **4.1 Pagination** (Organizations, Users) — `page`/`pageSize` +
  `.range()` + `{count:'exact'}`; `DataTable`'s pagination prop is new and
  shared, but **`apps/web` has its own separate, un-shared copy of
  `DataTable.tsx`** — this change only touched admin's.
- **4.2 Search/filter** — name search on Organizations; name+phone+email
  on Users. Email search needed a direct `pg` pool query against
  `auth.users` (not exposed via PostgREST, and `auth.admin.listUsers()`
  has no search param in the installed SDK version) — degrades to
  name/phone-only if that query fails, rather than 500ing the screen.
- **4.3 Bulk actions** — Organizations: bulk `change_plan` + bulk
  `export` only. Users: bulk `suspend`/`unsuspend` only. **Deliberately
  no bulk suspend/soft-delete on Organizations and no bulk delete on
  Users** — the plan's own explicit risk framing, not an oversight.
  Extracted `lib/organizations/actions.ts` / `lib/users/actions.ts` so
  the single-target and bulk routes share one mutation, not two copies
  that could drift.
- **4.4 Global cross-entity search** — ⌘K/Ctrl+K command palette
  (`GlobalSearch.tsx`), new visual language for this app (checked Doc
  05's component inventory first — nothing existing covered a command
  palette), built from the same overlay + `Card(raised)` primitives
  `ConfirmTypingDialog` already established.
- **4.5 Analytics/trends — Phase A only** (`0062`) —
  `platform_metrics_daily` + `snapshot_platform_metrics()`, daily
  snapshot mirroring the Dashboard's own current-day metric definitions
  exactly. **Phase B (actual trend charts) is intentionally not started**
  — needs a few weeks of real accumulated data before a chart built on it
  means anything more than the Dashboard's existing single-number cards;
  shipping it against near-empty history would be the same "looks real,
  isn't" problem this whole effort has been fixing elsewhere.
- **4.6 Proactive alerting** (`0063`) — extended `ping-service-health` to
  alert on service down/recovery and 2-consecutive-job-failures, Slack
  webhook (`ADMIN_ALERT_WEBHOOK_URL`, silently no-ops if unset). Debounce
  state (`admin_alert_state`) is a small dedicated table, not a column on
  either append-only history table — see that migration's header for why.
- **4.7 Email deliverability visibility** (`0064`) — `resend-webhook`
  Edge Function, manual Svix HMAC verification (no SDK dependency;
  verified against Svix's own documented test vector before trusting it —
  see the migration/function headers for the actual computed signature).
  Services Health gets a fourth section, bounces/complaints only
  (delivered/opened/clicked are logged but not surfaced — noise at this
  scale, per the plan). `email_delivery_events.org_id` exists as a column
  but is **not populated** — no outgoing email sends Resend `tags` yet,
  so there's nothing to correlate an incoming webhook event back to a
  specific org.
- **4.8 Internal notes / lightweight CRM layer** (`0065`) — `admin_notes`,
  shared `NotesPanel.tsx` on both `OrganizationDetail` and a new,
  **deliberately minimal** `UserDetail` page (notes only — `apps/admin`
  had no user-detail view of any kind before this; this doesn't build a
  full one). Edit/delete restricted to the original author or a Super
  Admin, enforced server-side.
- **4.9 Admin session visibility/management** (`0066`, `0067`) — new
  `ip_address` column on `admin_sessions` (didn't exist before), new
  `/admin-sessions` screen: self-service "my sessions" for everyone,
  cross-admin visibility + force-revoke restricted to Super Admin.
- **4.10 Feature flags** (`0068`) — **scope decision, made explicitly per
  the plan's own instruction not to build this reactively**: per-org
  boolean flags only, no percentage-rollout bucketing (the table shape
  leaves room to add that later without a breaking change).
  `get_feature_flag(org_id, key)` is callable by `authenticated`, not just
  `service_role` — nothing in the codebase consumes a flag yet, but the
  point of this item is giving mobile/web app code a real place to check
  one once a feature needs it. **Explicitly does not touch `0044`'s
  free-tier billing enforcement** — different mechanism, per the plan.

---

## CI

`.github/workflows/ci.yml` — your own existing monorepo-wide pipeline
(`lint` → `typecheck` → `test` → `format:check` via Turborepo) was found
already in place partway through this effort (not something this
remediation pass originated). It's been extended, not replaced:

- `lint-typecheck-test` job — `test` step now excludes admin
  (`turbo run test --filter='!admin'`) — admin's `test` script is a
  Playwright e2e suite that needs a live Supabase stack, not a stateless
  unit-test task the rest of this job can run the same way.
- `admin-e2e` job — new. Stands up `supabase start` + `supabase db reset`,
  bootstraps the TOTP Vault key, installs Playwright browsers, runs
  admin's full suite, uploads the HTML report as an artifact regardless of
  outcome. Includes a fail-fast check that `supabase status -o env`
  actually produced non-empty credentials before running anything else —
  that mechanism has genuinely changed shape between Supabase CLI versions
  before (see the job's own step comments for the specific cited issue).

`.github/workflows/supabase-keep-alive.yml` — untouched, unrelated to
this effort.

---

## Known gaps / deliberately deferred

Consolidated pointer list — each item's full reasoning lives in the
migration or file header referenced, not repeated here:

- **Tier 3.1 Konnect** — blocked on real sandbox credentials.
- **Tier 4.5 Phase B** — blocked on accumulated `platform_metrics_daily`
  history (weeks, not days).
- **`admin_storage_usage_by_org()`** has no per-org filter param, so the
  Organizations list still reads the whole storage bucket's rollup on
  every page load even after 4.1's pagination pass — fixing that means
  changing a shared RPC also used by Storage Monitor, out of that item's
  scope (`api/admin/organizations/route.ts`).
- **`auth.admin.listUsers()` stays capped at `perPage: 1000`** in every
  route that resolves emails (`api/admin/users/route.ts`,
  `api/admin/admins/route.ts`, `send-announcement-notifications`) — no
  bulk "look up these N ids" method exists in the Auth admin API to page
  against instead. Revisit once the platform has more than ~1000 total
  accounts.
- **No apps/web or apps/mobile UI test infrastructure** — Tier 2.2's
  banner components have no component-level test coverage; mobile's
  `src/test/` is Jest integration tests against sync/DB logic, not RN
  component rendering, and web has no test runner configured at all
  (`playwright test` with no config file present).
- **The real `pnpm --filter admin test` run has not been confirmed green**
  end-to-end in this environment — see Tier 2.4's note above. Treat this
  as the single highest-priority thing to verify before relying on this
  tier's correctness claims.
