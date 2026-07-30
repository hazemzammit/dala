# Mobile Implementation Status — Dala (Chantier OS)

> **Note on this file**: it did not exist anywhere in the repo as uploaded
> for this Phase 4 pass — I searched `docs/` for it before starting (per
> the brief's request to keep it in sync) and found nothing. Created fresh
> here rather than assumed to exist. If a copy already exists on a branch
> I don't have (yours or your web collaborator's), treat this as a
> proposed structure to merge against, not a guaranteed source of truth —
> flag that explicitly when opening the PR.

Scope: `apps/mobile` only. Web (`apps/web`) is out of scope for this
document and this branch.

## Phase 0 — Foundations, auth, app shell

Auth (sign-up/login/forgot-password/reset), app shell, tab navigation,
onboarding. **Shipped.**

## Phase 1 — Dispatch, vehicles, workers, attendance

Dispatch board, vehicle management, worker roster + invite flow, worker
check-in state machine, manual attendance (Pointage). **Shipped.**

Known issue found and fixed in Phase 2: migration 0019
(`0019_worker_self_access_and_payroll_rpcs.sql`) closed an RLS gap where
worker sessions were silently rejected by every `is_org_member()` policy —
meaning Phase 1's own worker check-in flow had never actually passed RLS
in a worker-authenticated session before that fix.

## Phase 2 — Advances, payroll, project expenses

Contractor advances/payroll, worker advance-request + salary view, project
expense ledger. **Shipped** (migration 0019).

## Phase 3 — Materials, site logs, safety, client portal

Materials approval + worker material-request/update-chantier, site
logs/journal, safety & insurance, client-portal management. **Shipped**
(migration 0020, `org-files` Storage bucket added here — didn't exist
anywhere before this migration).

Same worker-RLS bug class as Phase 1/2 recurred in materials/site_logs;
fixed again in the same migration.

## Phase 4 — Multi-org collaboration (this pass)

Doc 02 §2.8 / §2.8a. **Shipped**, with scope notes below.

**Schema** (migration 0024):

- `project_invitations` table — did not exist before this migration.
- `project_memberships.report_branding_opt_out` — new column.
  `budget_rollup_opt_in` is NOT new here; it already existed as of
  migration 0006 under that name (Doc 02's prose calls it `budget_shared`
  — same field, different name in the doc than in the schema).
- `site_logs` Shared-layer RLS — additive SELECT policy letting any
  project-member org read `site_logs` rows, not just the org that wrote
  them. Materials/safety_incidents/insurances remain org-only; Doc 02's
  own Shared-layer examples ("Task list", "Comment thread") don't
  correspond to any table in this schema.

**RPCs**: `invite_org_to_project`, `get_project_invitation_by_token`,
`accept_project_invitation` (all migration 0024).

**Screens**:

- `(contractor)/collaboration.tsx` — full build, replacing the stub. Acts
  as the multi-org project view (no dedicated project-detail screen
  exists anywhere in the app yet — `projects.tsx` is still a stub too).
- `accept-org-invite.tsx` — new. Branches to accept-directly /
  log-in-and-return / sign-up-with-prefill depending on session state.
- `(contractor)/vue-ensemble.tsx` — new. Cross-org rollup for accounts
  that own 2+ organizations.
- `(contractor)/dashboard.tsx` — org-switcher pill/sheet added as Vue
  d'ensemble's entry point; the rest of Doc 03 §3.9's home screen (hero
  card, dispatch summary, activity feed) is explicitly NOT built in this
  pass — out of Phase 4's stated scope.
- `sign-up.tsx` / `login.tsx` — extended (not rebuilt) to carry an
  optional invite token/redirect through, for the no-account and
  existing-account invite-accept paths respectively.

**Known gaps, stated rather than hidden**:

- Shared-layer `site_logs` ROW access works cross-org; the linked
  photo/voice file in the `org-files` Storage bucket does not (bucket
  path has no `project_id` segment to check against). See migration
  0024's file header for detail.
- Report branding: schema flag only. Actual report/PDF rendering is a
  web export concern, same scope boundary as Phase 3's own PDF-export
  cut. No mobile screen renders a report.
- WhatsApp/SMS/email dispatch of the invite link itself is not built —
  same division of labor as Phase 1's `invite_worker` (the row/token
  exists; actually sending it is a notification-dispatch concern handled
  elsewhere/later).
- ~~Migration numbering: `0019_admin_roles_and_sessions.sql` and
  `0020_announcements.sql` are stale duplicates of `0021`/`0022` of the
  same names — found while reading all migrations for this phase,
  flagged for cleanup, not touched by this migration.~~ **Correction
  (Phase 5): this was based on a stale/corrupted copy of
  `supabase/migrations` shared across more than one session. A fresh copy
  confirms these two files never existed in the real repo — 0019/0020
  were always the correct worker-self-access/field-ops files. No cleanup
  was ever actually needed.**

## Phase 5 — Reports & billing, Tier 0 AI, digest notifications (this pass)

Doc 02 §2.10. **Shipped**, with scope notes below. Doc 01 §1.16/§1.18/§1.19
do not exist in this repo as of this phase (confirmed by reading Doc 01's
current contents first — it stops at §1.13); built from Doc 02's own
prose instead, flagged inline everywhere that's the case.

**Correction, not a fix**: earlier in this delivery I believed
`0019_admin_roles_and_sessions.sql` and `0020_announcements.sql` existed
as stale duplicates of `0021`/`0022` (repeating a belief carried over from
Phase 4's notes) and deleted them. A freshly-provided copy of
`supabase/migrations`, diffed directly against this delivery, showed those
two files **do not exist in the real repo** — the accidentally-shared
folder used earlier was stale. Nothing has been deleted in this corrected
delivery; migration `0025` applies directly on top of the real `0024`.

**Schema** (migration 0025):

- `workers.deleted_at` — did not exist before this migration (only
  `projects` had soft-delete, since 0013). `soft_delete_worker` /
  `restore_worker` RPCs, `active_workers` view, and
  `purge_soft_deleted_records()` extended to also purge workers.
- `profiles.expo_push_token` / `profiles.notification_prefs` — new
  columns, per-account (not per-org — checked `activeOrg.ts`/`myOrgs.ts`
  before deciding this).
- `get_worker_lateness_pattern()` — Tier 0 dispatch-lateness RPC, computed
  live from `dispatch_assignments`, no new tracking table.
- `get_digest_summary()` — backs the new `send-digest-notifications` Edge
  Function.
- `is_shared_site_log_file()` + an additive `storage.objects` SELECT
  policy — closes the cross-org attachment gap flagged in 0024's own
  header (see Phase 4's "Known gaps" above). Confirmed still open before
  fixing it.

**Edge Functions** (all new): `export-org-data`, `generate-report`,
`send-digest-notifications` — the last of these is the FIRST actual
scheduled-job Edge Function in this repo; migrations 0013/0023 both
reference "a cron Edge Function wrapping `scheduled_job_runs`" as an
established pattern, but no such function existed anywhere before this
one (confirmed by listing `supabase/functions/` before writing it) — the
Phase 0 "keep-alive ping" and Phase 3 "Storage-purge" jobs this phase's
brief referenced as prior art were themselves never actually built as
code, only described in migration comments.

**Screens**:

- `(contractor)/trash.tsx` — new. Lists + restores soft-deleted projects
  and workers. Worker deletion is fully wired (new delete action on
  `team.tsx`'s rows); project deletion has NO entry point anywhere in
  mobile, because `projects.tsx` is still an unbuilt empty-state stub
  (confirmed before writing this file) — that's a pre-existing Phase 1/3
  gap, not rebuilt here.
- `(contractor)/worker/[id].tsx` — new. First dynamic route
  (`expo-router`'s `[id]` convention) anywhere in this mobile app; no
  prior screen established it. Deliberately minimal — identity header +
  the Tier 0 lateness card only, not a full worker-management hub (Doc 03
  never specifies one for mobile).
- `(contractor)/billing.tsx` — built out (was a stub). Read-only plan
  card against the existing `organizations.plan` field; "Passer à Pro" is
  present but inert (no Konnect integration exists — that's a real
  backend task, not faked here).
- `(contractor)/reports.tsx` — built out (was a stub). CSV only this
  phase, not the PDF/Excel Doc 03 §3.20 describes — no PDF/xlsx renderer
  wired into the Edge Function yet.
- `(contractor)/data-export.tsx` — new. Proposed scope (Doc 01 §1.16
  doesn't exist to specify this): CSV/JSON dump of the org's own tables,
  owner/manager only.
- `(contractor)/notification-settings.tsx` — new. Per-category push
  toggles + digest frequency. `settings.tsx` itself is still an unbuilt
  stub (confirmed before touching it) — only a single link to this new
  screen was added, not the rest of Doc 03 §3.22's Settings screen.

**Known gaps / scope cuts, stated rather than hidden**:

- Reports and data export are both CSV-only; PDF/Excel rendering needs a
  real library import in their Edge Functions, not added this phase.
- `payroll_summary` / `cnss_declaration` reports are basic aggregations
  over `attendance_records`/`advances` — NOT a certified payroll
  calculation or a filing-ready CNSS document.
- Billing has no storage-usage bar — computing it needs a recursive
  listing across every `org-files` subfolder, a feature of its own.
- Data export shares via React Native's `Share.share()` (text only), not
  a "save file to device" flow — that would need `expo-file-system` +
  `expo-sharing`, two new native dependencies not added this phase.
- `send-digest-notifications` needs its actual cron trigger wired up in
  the Supabase dashboard/CLI config — this phase ships the function's
  logic, not the schedule itself.
- Project soft-delete has no mobile entry point (see Trash's note above)
  — a consequence of `projects.tsx` never having been built, not
  something this phase's Trash screen was asked to fix.

## Phase 6 — Digest cron, storage bar, PDF reports, multi-project rollup (this pass)

Doc 02 §2.10 "Phase 6+". Most of the roadmap line for this phase is
genuinely blocked on product decisions, not code — see "Blocked, stated
plainly" below. What's shipped is the confirmed-in-scope subset: the three
bounded Phase-5 cleanup items (cron wiring, storage bar, PDF for two
report types) plus the multi-project rollup dashboard.

**Doc mismatch found before writing any code**: the 7 `.docx` files
provided this phase (`00-index-and-resolved-decisions.docx` through
`06-roadmap-ai-admin-testing-reference.docx`) are a different document set
from this repo's actual `docs/spec/00`–`05` — different files, different
topic splits, different section numbers. Not used for anything
code-relevant this phase; `docs/spec/*.md` remains the source of truth.
Confirmed Doc 01 still stops at §1.13, and Doc 02/03 still cite §1.14–§1.19
as if they exist — same gap Phase 5 already flagged, still open, not
closed this phase either (out of scope for what was asked).

**Migration** (`0026_phase6_digest_cron_wiring.sql`):

- `pg_cron` + `pg_net` extensions enabled; a real `cron.schedule()` call
  wires `send-digest-notifications` to actually fire daily at 05:00 UTC
  (06:00 Tunis time) — the ONE concrete gap Phase 5's own header flagged.
  Reads project URL/service role key from Supabase Vault rather than
  hardcoding secrets I don't have — **two manual one-time steps required
  after this migration runs**:
  ```sql
  select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
  select vault.create_secret('<service-role-key>', 'service_role_key');
  ```
  Until both exist, the job fires and fails loudly into
  `scheduled_job_runs` (visible in Platform Admin) rather than silently
  no-op-ing.

**Edge Function** (`generate-report`, modified):

- PDF added for `progression`/`safety_summary` only, via `pdf-lib`
  (pure TS/no native deps, imported the same `npm:` way as
  `@supabase/supabase-js` already is in this function). Both report types
  now build a shared `{headers, rows}` table once and render to either
  CSV or PDF from the same data, so the two formats can't drift apart.
  `payroll_summary`/`cnss_declaration` remain CSV-only — never asked for
  PDF, not added. `.xlsx` remains entirely unbuilt.
- `packages/validation/src/exports.ts`'s `generateReportSchema` widened
  from `format: z.literal('csv')` to `z.enum(['csv','pdf'])`, with a
  `.refine()` restricting `pdf` to the two eligible report types — this is
  enforced at both the schema layer and, redundantly, inside the function
  itself (defense in depth, not the only check).

**Screens**:

- `(contractor)/billing.tsx` — storage-usage bar added.
  `getOrgStorageUsageBytes()` (new, `lib/storage.ts`) does a generic
  recursive walk of the `org-files` bucket (categories are open-ended
  strings, not a fixed enum, so this doesn't hardcode a category list that
  would go stale) with pagination and a depth cap. Separate loading state
  from the plan card so a slow storage calculation doesn't block the rest
  of the screen. Konnect integration remains unbuilt — confirmed no
  sandbox credentials exist before touching this file again; "Passer à
  Pro" stays inert.
- `(contractor)/reports.tsx` — CSV/PDF format toggle added, shown only for
  the two PDF-eligible report types. **`expo-file-system` and
  `expo-sharing` are now real dependencies** (not optional/deferred) —
  `Share.share({ message })` only carries text and cannot hand a user a
  binary PDF; there was no way to make the confirmed PDF feature actually
  usable without them. Uses SDK 54's class-based `File`/`Paths` API
  (`expo-file-system`'s new default export), not the deprecated legacy
  functional API. CSV path is unchanged (still `Share.share`).
- `(contractor)/project-rollup.tsx` — new. Multi-project rollup dashboard
  (Doc 02 §2.10, confirmed scope: rollup across projects within one org).
  Standalone screen, same "minimum slice, real entry point" reasoning
  Phase 4 used for `vue-ensemble.tsx` — does NOT build out
  `dashboard.tsx`'s full Doc 03 §3.9 Home layout (still a placeholder,
  unrelated to this) or `projects.tsx`'s list/CRUD (still an unbuilt
  stub, still a separate Phase 1/3 gap). Per-project stats (budget
  consumed %, workers dispatched today, pending material requests) are
  fetched client-side in parallel per project, same pattern as
  `vue-ensemble.tsx`'s per-org fetch — RLS already scopes every table
  correctly, so no new RPC was needed. Entry point: new "Chantiers" row on
  `dashboard.tsx`.
- `(contractor)/dashboard.tsx` — one new row added (entry point above).
  Still not Doc 03 §3.9's real Home; unrelated to this addition.

**Blocked, stated plainly rather than built against invented spec**:

- **Tier 1 AI** — no algorithm defined anywhere in spec beyond one
  sentence in Doc 02 §2.9 ("lightweight statistical models on top of
  Tier 0's data"), and no accumulated real-world data exists to validate
  against (`supabase/seed.sql` is 21 lines of commented-out dev
  scaffolding — confirmed before concluding this). Blocked on both spec
  and data, not just data.
- **Legal contract templates** — still flagged "pending legal review" in
  Doc 02 §2.10, verbatim, confirmed unchanged. Not touched.
- **Seat-based pricing** — no spec beyond the roadmap line. Blocked on:
  what counts as a seat, price per seat, and how it plugs into the
  still-nonexistent Konnect subscription lifecycle. None of these are
  mine to invent.
- **Konnect billing integration** — confirmed no sandbox/API credentials
  exist. Billing's "Passer à Pro" remains inert.

## Phase 7 — Settings, projects, Doc 01 gap closure (this pass)

**Documentation gap closed**: Doc 01 (`docs/spec/01-data-model-security-and-architecture.md`)
stopped at §1.13 across Phases 4–6 while Doc 02/03 cited §1.14–§1.19 by
name and sub-section. Wrote all six sections this phase, reverse-engineered
from what Doc 02/03 already assumed and what's actually built (attendance/
expense mechanics, Trash, cross-org rollup, Tier 0, digest scheduling) —
except §1.15 (2FA), which is written to record honestly that optional
per-account 2FA was **investigated fresh this phase and confirmed never
built** for regular org accounts (only Platform Admin has mandatory TOTP,
a separate table/system) rather than deferred on purpose. See §1.15 for
the full finding and what a future 2FA phase would need to build.

**Schema**:

- `projects.start_date` / `projects.project_type` (migration 0028) — a real
  Doc-prose-vs-schema gap: Doc 03 §3.10.3 listed both as required Create/
  Edit fields, but neither column nor any validation existed before this
  phase (confirmed by reading migration 0006 and `createProjectSchema`
  before writing anything). `project_type`'s six enum values are a Phase 7
  judgment call — spec never enumerates them, see the migration header.
- `phone_change_requests` table + `request_phone_change`/
  `confirm_phone_change` RPCs (migration 0028) — Doc 03 §3.22.1's phone
  re-verification. Real code-generation/hashing/expiry/attempt-cap
  mechanics; actual SMS delivery is routed through a `sms_provider_webhook_url`
  Vault secret that doesn't exist in this project yet (no SMS provider was
  ever wired anywhere in this repo, confirmed by grep) — the call fails
  loudly if that secret is missing, same pattern as 0027's digest cron
  secrets, rather than silently no-op'ing.
- `update_organization_member_role` / `remove_organization_member` RPCs
  (migration 0028) — owner-only, blocks demoting/removing the last
  remaining owner. Manages existing `organization_members` rows only; see
  scope cut below.
- `update_organization_profile` RPC (migration 0028) — column-level
  enforcement that matricule_fiscal/rc_number stay owner-only, since
  `organizations_update_owner_manager` (0005) is a row-level RLS policy
  and can't express a per-column permission split.
- `request_account_deletion()` RPC + new `delete-account` Edge Function
  (migration 0028 + `supabase/functions/delete-account/`) — Doc 03 §3.22
  "Supprimer mon compte." The RPC validates the "not a sole org owner
  elsewhere" invariant and stamps `profiles.deletion_requested_at`; the
  Edge Function (service-role) performs the actual `auth.admin.deleteUser`
  call a client can never make itself, re-validating the same invariant
  server-side rather than trusting the RPC step already ran.
- **Two real, pre-existing bugs found and fixed**: `updateOrganizationSchema.logo_url`
  and `updateProfileSchema.avatar_url` (`packages/validation/src/organizations.ts`)
  were both validated with `.url()`, but `lib/storage.ts`'s own established
  convention (confirmed by reading it) stores a bare STORAGE PATH
  (`{orgId}/{category}/{uuid}.ext`), never a full URL — neither field had
  ever actually been exercised by a real screen until this phase, so the
  mismatch went uncaught. Fixed to a plain `z.string()`.

**Screens**:

- `(contractor)/settings.tsx` — rebuilt from the Phase-5 stub (a single
  Notifications link) into the full Doc 03 §3.22 row list: Profil,
  Organisation, Sécurité, Notifications (existing), Langue (bottom sheet,
  not a separate screen), Membres de l'équipe, Facturation (existing
  `billing.tsx`), Déconnexion, Supprimer mon compte.
- `(contractor)/profile-settings.tsx` — new. Avatar upload (center-square
  crop + 512×512 resize via `expo-image-picker`/`expo-image-manipulator`,
  reusing `lib/storage.ts`'s existing `org-files` upload path — NOT the
  full interactive drag-to-reposition crop tool the spec's phrasing could
  imply, see `photoPipeline.ts`'s header), full name, phone (via the new
  request/confirm-code RPCs), email (via Supabase Auth's own built-in
  secure-email-change flow, `auth.updateUser({ email })` — not a custom
  table, since it targets `auth.users.email` directly).
- `(contractor)/organization-settings.tsx` — new. Logo upload (center-crop
  to ≤3:1, only when the source is wider than that), name/trade_type/
  address/contact fields editable by owner+manager, matricule_fiscal/
  rc_number shown read-only with a lock icon for a manager (owner-only,
  enforced by the new RPC, not just the UI).
- `(contractor)/security-settings.tsx` — new. Password change (re-auth via
  `signInWithPassword` before `auth.updateUser({ password })`, since
  Supabase Auth has no separate "verify current password" primitive). A
  disabled 2FA row states plainly that it isn't built yet rather than
  omitting it silently.
- `(contractor)/team-members.tsx` — new. Manages `organization_members`
  (owner/manager/viewer role change + removal, owner-only) — deliberately
  a **different** screen from the existing `team.tsx` (Doc 03 §3.13, which
  manages `workers`/field employees). Doc 03 §3.22's "Membres de l'équipe"
  line conflates two different tables/entities; splitting them into two
  screens was judged clearer than merging two different row shapes into
  one list. **Scope cut**: shows/manages members who already exist — does
  NOT add a new invite-a-member-by-email pipeline (a parallel system to
  `worker_invitations` that doesn't exist yet; sizable enough to be its
  own phase).
- `(contractor)/delete-account.tsx` — new. Typed-confirmation
  (`"SUPPRIMER"`) flow calling the RPC + Edge Function above. Deliberately
  no 30-day undo window the way Trash gives projects/workers — Doc 03
  frames this as an immediate, serious action, not one the spec ever asks
  to be recoverable.
- `(contractor)/projects.tsx` — rebuilt from the Phase-0 empty-state stub
  (unbuilt across Phases 1–6) into Doc 03 §3.10.1 (list, search, filter
  chips) + §3.10.3 (create/edit). Gives `soft_delete_project` (migration 0013) its first mobile caller — before this phase, a project could only
  be soft-deleted via web, Platform Admin, or seed data (`trash.tsx`'s own
  Phase 5 header already flagged this honestly). **Scope cuts, stated
  plainly**: tapping a project opens a lightweight detail SHEET, not the
  full Doc 03 §3.10.2 tab-bar hub — `expenses.tsx`/`materials.tsx`/
  `journal.tsx`/`safety.tsx`/`dispatch.tsx` remain the standalone,
  project-picker-driven screens Phases 1–6 built them as (rebuilding all
  five into one hub's tabs is a much larger undertaking); progress %/ring
  is not shown anywhere (no milestones/tasks table exists in this schema
  to compute it from — building real progress tracking is new
  speculative ground, exactly what this phase was scoped to avoid); no
  native date-picker dependency was added (none existed anywhere in this
  repo before this phase) — "Date de début" is a validated AAAA-MM-JJ
  text field.

**Tests**: `vitest` was already configured in `packages/validation`'s own
`package.json` (`"test": "vitest run"`) but had **zero test files anywhere
in this repo** outside `apps/admin`'s three Playwright specs — confirmed
by search before writing anything. Added `projects.test.ts` (10 tests) and
`organizations.test.ts` (11 tests) covering exactly this phase's new/
changed schemas; ran both in an isolated sandbox — **21/21 pass**. This is
NOT Doc 02 §2.11's full test-matrix buildout (Jest/Detox mobile e2e, an
RLS matrix, idempotency integration tests, offline-conflict tests) — that
remains a real, honestly-sized gap for its own phase (see below).

**Explicitly pushed to their own next phase, not built here**:

- **2FA (Doc 01 §1.15)** — confirmed never built for regular org accounts.
  Scoping this properly (TOTP enrollment, recovery codes, a login-flow
  verification step) is real feature work, not a settings-page toggle.
- **Full Doc 02 §2.11 test-matrix buildout** — `detox ^20.28.4` sits in
  `apps/mobile/package.json` as a devDependency with a `"test": "detox
test"` script and **zero e2e specs to run** — confirmed by search.
  Going from 0% to the spec's actual matrix (Jest unit coverage across the
  app, Detox e2e for offline conflicts/dispatch/attendance, an RLS
  permission matrix, idempotency integration tests) is its own phase by
  any honest estimate, not an add-on to this one.

**Still blocked, unchanged from Phase 6** — Tier 1 AI, legal contract
templates, seat-based pricing, Konnect billing integration. None of these
were touched; no new information surfaced this phase that would unblock
any of them.

## Phase 8 — Two-factor authentication (this pass)

**Architecture decision, made explicitly rather than silently**: Doc 01
§1.15 (written in Phase 7) left 2FA scoped for "its own phase." Before
building anything, this phase surfaced a real fork — mirror Platform
Admin's existing custom `totp_secret` column approach (migrations 0009/
0021/0023), or use Supabase Auth's own native TOTP MFA. Platform Admin's
implementation stores the secret in **plain text** (its own migration
comment already flags this as needing Vault hardening) and, more
fundamentally, any custom post-login check is only ever a client-side
gate — Supabase issues a fully-valid session at `signInWithPassword`
regardless of enrolled factors, so a modified client could skip a custom
check. Native MFA's session carries a real `aal` claim GoTrue itself
controls. **Built with native MFA** (Option B), leaving Platform Admin's
TOTP as a separate, legacy mechanism — migrating it too is a bigger,
cross-cutting change out of scope here.

**Database** (`supabase/migrations/0029_phase8_two_factor_authentication.sql`):

- `mfa_recovery_codes` table + `generate_mfa_recovery_codes()` /
  `count_unused_mfa_recovery_codes()` RPCs — the one thing native MFA
  doesn't provide out of the box. Generating codes requires the calling
  session to already be `aal2`.
- `verify_and_consume_recovery_code(p_user_id, p_code)` — service-role
  only (explicitly revoked from `authenticated`/`anon`), used by the new
  `mfa-recover` Edge Function.
- **Security finding, disclosed rather than silently worked around**:
  Postgres grants `EXECUTE` on a new function to `PUBLIC` by default
  unless explicitly revoked, and this repo's own `0016_default_grants.sql`
  only ever documents table-level grants — every `SECURITY DEFINER`
  function created across every prior migration appears to rely on
  `authenticated`-only usage in practice (most check `auth.uid()`, which
  is null for an unauthenticated caller) rather than an explicit `PUBLIC`
  revoke. `verify_and_consume_recovery_code` is the one function this
  phase added that would be genuinely dangerous left at the Postgres
  default (it trusts an explicit `p_user_id` with no `auth.uid()` check),
  so it's explicitly locked to `service_role` only. **A full audit of
  every other RPC's grants across the whole schema is a real, worthwhile
  follow-up** — out of scope to do as a side effect of this phase, but
  flagged here rather than left for someone to discover independently.

**New Edge Function**: `supabase/functions/mfa-recover/` — verifies
password + a single-use recovery code, then **disables 2FA entirely**
(removes every TOTP factor via the admin API) rather than trying to fake
an `aal2` session, which Supabase's model doesn't support doing safely.
Disclosed as a real trade-off in the function's own header and on the
recovery screen's copy — a correct recovery code turns 2FA off, it
doesn't grant one-time entry while leaving it enabled.

**Mobile**:

- `login.tsx` — after `signInWithPassword`, checks
  `getAuthenticatorAssuranceLevel()` and routes to the new
  `mfa-challenge.tsx` when a factor is enrolled and unverified this
  session.
- `mfa-challenge.tsx` (new, top-level route) — 6-digit TOTP verification,
  with a link out to lost-authenticator recovery.
- `mfa-recover.tsx` (new, top-level route) — re-asks for email+password
  rather than threading the original password through navigation
  state/params, a deliberate security choice for this rare path.
- `(contractor)/security-settings.tsx` — the Phase 7 disabled "not built
  yet" row replaced with real enroll/disable/regenerate-codes UI. QR
  code renders via `react-native-svg`'s `SvgXml` directly from
  Supabase's own `enroll()` response (`totp.qr_code` is already a
  ready-to-render SVG string, confirmed by reading `@supabase/auth-js`'s
  type definitions) — **no new dependency needed**, despite this
  session initially planning to add a separate QR-generation library
  before that check caught it.

**Tests**: `packages/validation/src/mfa.test.ts` — 11 new tests for
`totpCodeSchema`/`recoveryCodeSchema`/`mfaRecoverSchema`, run in an
isolated sandbox alongside Phase 7's 21 — **32/32 pass**. Still not Doc
02 §2.11's full matrix (no Detox e2e for the actual enroll → logout →
login-with-TOTP flow this section names directly) — that gap is
unchanged from Phase 7's own honest sizing of it.

**Not touched this phase**: Platform Admin's existing TOTP (left as
legacy, per the Option B decision above); the full Doc 02 §2.11 test
matrix; the broader RPC-grants audit flagged above.

## Phase 9 — RPC-grants audit, invite-by-email, Jest/Detox infra (this pass)

**1. RPC public-grants audit — ran for real, not carried forward.**
Went through every `SECURITY DEFINER` function across all 29 prior
migrations and checked its actual grant state. Result: 23 of 24 already
had an explicit grant/revoke at creation (authenticated, a deliberate
`anon` grant for genuinely pre-login RPCs, or locked to `service_role`
with everything else revoked) — Phase 8's worry turned out to be mostly
unfounded once actually checked, not confirmed. **One real gap**:
`is_shared_site_log_file(text)` (0025, backing a `storage.objects` policy)
had no explicit grant, so it sat at Postgres's `PUBLIC EXECUTE` default —
letting an unauthenticated caller probe arbitrary storage paths for
existence via direct RPC. Fixed in `0030_phase9_rpc_grants_and_org_
member_invitations.sql` (`revoke ... from public, anon` /
`grant ... to authenticated`). The plain `SECURITY INVOKER` predicate/
soft-delete functions (`is_org_member`, `org_role_of`,
`soft_delete_project`, etc.) were confirmed NOT to need a grant fix —
they run under the caller's own privileges, so existing table grants
(0016) and RLS already gate them correctly.

**2. Org-member invite-by-email** (Doc 03 §3.22, cut from Phase 7):

- `organization_member_invitations` table + RLS (any member can see an
  org's pending invitations; only the owner can create/edit one) — same
  migration as above.
- `invite_organization_member(org_id, email, role)` — owner-only,
  upserts by `(org_id, lower(email))` so re-inviting updates the existing
  row. `role` is constrained to `manager`/`viewer` — inviting someone
  directly in as `owner` isn't part of this pipeline (see the migration's
  own comment for why: handing over full org control through an email
  link with no extra confirmation is a different, bigger decision).
- `get_organization_member_invitation_by_token` (anon-safe) and
  `accept_organization_member_invitation` (existing-account path,
  `SECURITY DEFINER`, verifies the accepting session's email matches the
  invited address — real access control, not a courtesy).
- New Edge Function `accept-organization-invitation` — the no-account
  path. Deliberately mirrors `accept-worker-invitation`'s shape (service
  role, invite-is-identity-proof) rather than `sign-up`'s, because unlike
  `sign-up` this must NOT create a new organization — the person is
  joining an existing one.
- `(contractor)/team-members.tsx` — the "bientôt disponible" placeholder
  replaced with a real invite sheet (email + manager/viewer picker) and a
  pending-invitations list, gated to the org owner.
- New top-level screen `accept-organization-invite.tsx` — three-way
  branch (already logged in / has an account / no account), same shape
  as `accept-org-invite.tsx`'s existing pattern, since an invited org
  member plausibly already has a Dala account (unlimited-orgs-per-account
  is a core decision, Doc 00 §0.5).
- **Deliberate scope cut, stated plainly**: actually sending the
  invitation e-mail is not built — same disclosed boundary as Phase-1's
  worker-invite WhatsApp/SMS delivery. The invitation row + accept screen
  exist; a human currently has to share the link manually. The mobile UI
  says this outright rather than implying it's automatic.

**3. Doc 02 §2.11 test-matrix — scoped conservatively, not attempted
whole.** §2.11 names Jest unit coverage, Detox e2e for several named
flows, an RLS permission matrix, idempotency integration tests, and more
— read in full before committing to anything, and it's genuinely two
phases of work, not one. What shipped this phase:

- **Jest actually stood up** (`apps/mobile` had zero test infrastructure
  before this — not "zero tests using existing infra," an empty
  `"test": "detox test"` script pointing at nothing). Added `jest`,
  `jest-expo`, `@testing-library/react-native`. Found and fixed a real
  monorepo bug along the way: a hoisted `@babel/runtime@7.21.0` too old
  for RN 0.81.5's own jest preset (`ERR_PACKAGE_PATH_NOT_EXPORTED` on
  `helpers/callSuper`) — pinned via a root `pnpm.overrides` to `^7.25.0`.
- Extracted the expenses screen's consumed-% calculation out of an inline
  `useMemo` into a testable `lib/budget.ts` (this is the kind of thing
  Doc 02 §2.11 asks for — real logic covered, not incidental helpers) and
  wrote `budget.test.ts` (6 tests) + `appVersion.test.ts` (9 tests,
  covering the cold-start version-gate's fails-open behavior explicitly —
  the one thing in that file worth pinning against regression). **15/15
  pass.**
- **Detox actually configured**, not just present as a devDependency:
  `.detoxrc.js` (iOS simulator + Android emulator configs, assuming a
  one-time local `expo prebuild` — this is an Expo-managed project with
  no checked-in native folders), `e2e/jest.config.js` (deliberately
  separate from the unit-test Jest config — different test environment),
  and the actual named flow from §2.11: `e2e/twoFactorAuth.e2e.ts`
  (enroll → logout → login-with-TOTP). Added `testID`s to every screen
  the flow touches (login, security-settings' enroll/disable steps,
  mfa-challenge, settings' logout row, the bottom-nav Plus tab, the Plus
  sheet's Settings item) — none of these existed anywhere in the app
  before this phase. The test computes a _real_ TOTP code from the
  enrollment secret via `otplib` (reading the on-screen manual-entry
  secret, same one a human would type into an authenticator app) rather
  than only exercising the wrong-code error path. **Not run against a
  real simulator/device in this delivery** — no device/emulator available
  in the sandbox this was built in; typechecked clean, but "written
  correctly" and "confirmed passing on a real build" are different
  claims, and only the first one is true yet. Needs `expo prebuild` +
  `pnpm test:e2e:build` + a seeded `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`
  test account (no factor enrolled) run locally before trusting it.
- **Explicitly left for a follow-up phase**: the RLS permission matrix,
  idempotency integration tests, the offline-conflict Detox test, and
  attendance-reconciliation/expense-calculation integration tests. Each
  needs seeded test-data infrastructure that doesn't exist yet: bolting
  that on alongside everything else this phase is exactly the "commit to
  all of it and cut corners" outcome flagged as a risk before starting.

**Bonus fix, found and disclosed rather than left**: while getting
`pnpm typecheck` to a clean baseline for this phase's own new files,
found a **pre-existing** typecheck error — `<ArrowLeftIcon onPress={...}
/>` (Phosphor icons don't accept an `onPress` prop) — broken identically
across 5 screens (`delete-account.tsx`, `organization-settings.tsx`,
`profile-settings.tsx`, `security-settings.tsx`, and the pre-Phase-9
`team-members.tsx`), predating this phase entirely. Fixed using the
pattern the codebase itself already uses correctly elsewhere
(`notification-settings.tsx` — wrap the icon in an `XStack` that carries
the `onPress`). `pnpm --filter mobile typecheck` is now clean across the
whole app, not just this phase's new files.

**Item 4 (Doc 03 §3.10.2 project-detail tab hub) — not started.** Items
1–3 didn't leave room, largely because scoping #3 honestly (standing up
real Jest/Detox infra, not faking coverage) took the space that would
have gone to it. Unchanged from Phase 7/8: `expenses.tsx`/
`materials.tsx`/`journal.tsx`/`safety.tsx`/`dispatch.tsx` remain
standalone, project-picker-driven screens; `projects.tsx`'s detail view
remains the lightweight sheet.

**Still explicitly blocked, unchanged**: Tier 1 AI, legal contract
templates, seat-based pricing, Konnect billing, progress %/ring tracking
(no milestones/tasks data model — still deliberately not built as a side
effect of anything this phase touched).
