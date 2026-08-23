# Dala — Cahier des Charges v4.0

## Document 02 — Features, Field Operations, Multi-Org Collaboration & Roadmap

> Every module below is now built for **both mobile and web simultaneously**
> for contractor roles (Doc 00 §0.4). Where a module has a platform-specific
> interaction (camera capture, drag-and-drop), it's called out — the
> underlying data and permissions never differ by platform.

---

## 2.1 Feature overview

| Module                             | Section | Contractor platforms                                           |
| ---------------------------------- | ------- | -------------------------------------------------------------- |
| Dispatch & vehicle management      | 2.2     | Mobile + Web                                                   |
| Advances & payroll                 | 2.3     | Mobile + Web                                                   |
| Materials                          | 2.4     | Mobile + Web                                                   |
| Site logs / photo timeline         | 2.5     | Mobile + Web                                                   |
| Safety & legal compliance          | 2.6     | Mobile + Web                                                   |
| Client-facing features             | 2.7     | Mobile + Web (portal itself is a separate client-only surface) |
| Multi-org collaboration            | 2.8     | Mobile + Web                                                   |
| Professional & Enterprise features | 2.9     | Mobile + Web (post-MVP)                                        |

---

## 2.2 Dispatch & vehicle management

**Dispatch board (contractor view)**: defaults to today, can plan
ahead. On mobile, a scrollable weekly grid; on web, the same grid with
drag-and-drop reassignment between vehicles and a wider viewport
showing more days at once without scrolling — same underlying
`dispatch_assignments` writes either way.

**Sending assignments**: workers with an app account get a push
notification with destination, teammates, vehicle, departure time, and
tools to bring. Workers without an app account trigger a one-tap
WhatsApp share-sheet message with the same content, pre-filled — the
SMS/WhatsApp fallback flagged in Doc 00's risk register (no WhatsApp
Business API).

**Weekly view**: worker × day grid, with **"Copier semaine
précédente"** — pre-fills the entire week from last week's pattern.
Highest-leverage retention feature in this module (~70% of assignments
repeat week to week).

**Conflict detection**, checked before send, identical on both
platforms: overbooking (worker on two vehicles), over-capacity (more
workers than seats), assigning a worker marked absent, assigning a
vehicle in maintenance, missing required certification for a
specialized project (configurable warning). Conflicts block send until
resolved or explicitly overridden.

**Dispatch history**: every dispatch plan is permanent — date, vehicle,
workers, destinations, departure time, confirmation channel
(app/WhatsApp/call/SMS), actual vs. planned departure. After ~3 months
of data, the app surfaces rule-based patterns ("Ahmed is late by an
average of 22 minutes on Mondays") — deterministic SQL, not ML (§2.9),
now actually **shown** to the contractor on the Worker Detail screen
rather than only collected (Doc 01 §1.18).

**Attendance is its own ledger, not just a dispatch side-effect**: a
worker's "Je suis arrivé" tap auto-writes a `present` attendance record
(Doc 01 §1.14.3), but plenty of real work days have no dispatch
assignment at all — workshop prep, indoor work on a rain day, a worker
who didn't need a vehicle. A new **Pointage** screen (§2.2a) lets a
contractor mark attendance manually for any day/worker without
requiring a dispatch entry, and this — not dispatch alone — is what
payroll (§2.3) actually reads from.

**Vehicle management**: fleet list, per-vehicle status (available,
in-use, maintenance), assigned driver, capacity. Identical CRUD on both
platforms.

---

## 2.2a Manual attendance (Pointage)

A date-scoped roster screen, independent of the dispatch board: every
active worker in the org listed with a three-state toggle
(Présent/Absent/Demi-journée), a "Marquer tous présents" bulk action
for a normal full-crew day, and an optional per-row project
association (for labor-cost context, though — per Doc 01 §1.14.2 —
this doesn't automatically feed the expense ledger). A manually-marked
entry is never silently overwritten by a later dispatch check-in for
the same worker/day (Doc 01 §1.14.3) — whichever entry a human
explicitly confirmed wins.

---

## 2.2b Project expenses

Closes the previously-undefined "budget consumed %" gap (Doc 01
§1.14). Per-project expense list: category (matériaux / carburant /
sous-traitance / autre), amount, optional description and receipt
photo (same compression pipeline as site logs, §2.5), date. Consumed
% on a project card is `SUM(expenses) / budget_total` for that org —
worker payroll is deliberately excluded from this sum to avoid
double-counting against advances (Doc 01 §1.14.2); a contractor who
wants labor reflected in the number logs it as its own expense line.
Owner/Manager can add/edit/delete; Viewer is read-only, consistent
with the existing role table (Doc 01 §1.4).

---

## 2.3 Advance & payroll tracking

Advances are the single largest source of financial confusion for the
target user — a paper notebook has no running balance, no cross-worker
total, gets lost or wet, and produces disputes the contractor can't
resolve. This module replaces it entirely.

**Contractor view (mobile + web)**: a per-worker weekly card (gross,
advances, net, "mark as paid"), a running weekly total across all
workers, a manual quick-advance flow (worker → amount via quick-tap
chips → confirm, target under 5 seconds on mobile; web uses a compact
form with the same chip-style amount shortcuts), and a PDF export of
the cycle summary.

**Worker view (mobile only)**: a live view of current-cycle balance
(gross so far, advances received, estimated net), and an advance
request flow (amount, optional reason). Contractor approves in one
tap; approval writes directly to `advances` and is deducted from the
next salary calculation automatically.

**Salary cycle**: weekly, day-by-day breakdown sourced directly from
`attendance_records` (Doc 01 §1.14.3 — present/absent/half-day with
TND value, regardless of whether that day came from a dispatch
check-in or a manual Pointage entry), gross, advances deducted, net
owed, payment status. Marking a cycle paid sends the worker a
confirmation push notification.

---

## 2.4 Materials

**Worker-side request (mobile only)**: item, quantity, urgency toggle,
optional note.

**Contractor-side approval (mobile + web)**: push/in-app notification,
approve, reject with a reason, or reassign to another worker. Approved
requests auto-populate the project's materials list (`materials` table,
`created_by` set to the worker's linked profile). Web adds a bulk-
approve action for contractors triaging a backlog of requests from a
desk — not available on mobile, where the one-at-a-time flow fits the
field context better.

---

## 2.5 Site logs / photo timeline

**Worker-side capture (mobile only)**: a photo, a voice note, or a
quick text note — whichever is fastest in the moment. Flows directly
into the project's site log; if no log exists yet for today, one is
auto-created from the worker's update, and the contractor sees it on
the live board immediately.

**Contractor-side review (mobile + web)**: chronological timeline, tap
(mobile) or click (web) for full-screen with caption. Web additionally
supports uploading photos from disk (e.g. a site-visit photo taken on
a separate camera) — mobile's camera-native capture has no web
equivalent, so this is the one place the two platforms genuinely
diverge in input method while producing the same `site_logs` rows.

**Client-side photo compression (mandatory, both platforms)**: site-log
photos are by far the highest-volume content type against the org's
1GB storage quota (Doc 01 §1.6), so every photo is resized and
re-encoded on-device _before_ it enters the upload queue, never
server-side after the fact:

- Resize to a 1920px longest edge (construction-site photos rarely need more resolution than that for their actual use — reviewing progress, documenting an issue — and this alone typically cuts a modern phone photo from 4–8MB down to a few hundred KB).
- Re-encode as JPEG at ~80% quality.
- Strip GPS/EXIF metadata in the same pass (this was already required for privacy, Doc 01 §1.3.11 — compression and EXIF-stripping are done as one combined step, not two separate passes).
- Mobile: `expo-image-manipulator`. Web: Canvas-based resize/re-encode in-browser (no library dependency needed for this).
- A small thumbnail derivative (300px wide) is generated alongside the full compressed image for list/timeline views, so scrolling the site-log feed doesn't pull full-size images just to render a row of small previews.
- Offline capture on mobile still compresses immediately on-device, before the file even enters WatermelonDB's local sync queue — so a bad-connectivity sync later has less to push, not more.

---

## 2.6 Safety & legal compliance

**Safety incident log**: date, location, description, photos, severity,
involved worker(s), stored per-project, exportable as PDF. Full CRUD on
mobile and web.

**CNSS assistant**: a PDF-generation convenience, not a live API
integration — Tunisia's CNSS has no public submission API. The app
pre-fills a CNSS declaration PDF from existing worker/attendance data;
the contractor still submits it manually through CNSS's own channel.

**Insurance tracker**: policy number, provider, coverage type, expiry
date, reminder 30 days before expiry (`org_insurances`).

**Document vault**: per-project storage for permits, insurance
certificates, contracts; counts toward the org's storage quota.

---

## 2.7 Client-facing features

**Client portal**: read-only web view per project, access via a signed
link, optional 4-digit PIN for sensitive projects.

- PIN hashed with Argon2id before storage.
- Lockout: 5 failed PIN attempts locks the portal link for 15 minutes.
- Session: portal session token expires after 24 hours of inactivity; re-entering the PIN refreshes it.
- PIN reset: only the contractor (owner/manager) can reset a client's PIN, from project settings — the client has no self-service reset, since there's no client login/email on file. **This is a separate, deliberately minimal auth surface from the contractor email+password system — clients are not "users" in `profiles`, and this doesn't change with the auth rework.**

**Progress reports**: photos, completed tasks, progress %, contract
balance — never cost breakdowns, margin, or payroll (the "Client"
visibility layer, §2.8).

**Milestone approvals**: client approves/rejects a milestone from the
portal; approval timestamp feeds the payment-reminder logic (§2.3).

---

## 2.8 Multi-org collaboration

Every project a lead org starts is a distribution channel — inviting a
plumber and an electrician onto a project is a primary acquisition
loop. Built for both mobile and web from day one.

**Visibility layers** (three-layer model):

| Layer   | Who sees it                        | Example                                             |
| ------- | ---------------------------------- | --------------------------------------------------- |
| Private | Only the org that owns the data    | Trade org's own itemized expenses, its own payroll  |
| Shared  | All orgs on the project            | Task list, schedule, comment thread                 |
| Client  | The project's client (portal only) | Progress %, photos, contract balance — never margin |

| Data           | Lead sees | Trade sees | Client sees  |
| -------------- | :-------: | :--------: | :----------: |
| Task list      |    yes    |    yes     | summary only |
| Comment thread |    yes    |    yes     | comment only |

**Report branding**: lead org's branding is primary (logo, header,
contact block); each contributing trade org gets a secondary
attribution line under its section ("Plomberie par [Trade Org Name]").
A trade org can opt out via a flag on its `project_memberships` row.

**Budget rollup for lead orgs**: opt-in, per trade org, per project —
not automatic. At invitation acceptance, the trade org sees a single
checkbox: "Partager mon budget consommé avec [Lead Org] pour ce
chantier." Default off. If enabled, the lead sees only an aggregate
consumed-% — never itemized expenses (`budget_shared` boolean on
`project_memberships`) — computed from the trade org's own
`project_expenses` rows (Doc 01 §1.14) on that project, same source
data as the org's own budget bar, just aggregated rather than
itemized when shown to another org.

**Invite flow (mobile + web)**: lead org invites a trade org by phone
or email; if the trade org doesn't yet have an account, the invite
doubles as an onboarding link into the standard sign-up flow (Doc 01
§1.3.3) — the multi-org invite doesn't bypass the password-based
account creation, it just pre-fills organization context.

**Not to be confused with §2.8a below**: this section is about
multiple _different_ organizations collaborating on one shared
project. §2.8a is about one _single_ account that owns multiple
organizations — a different concept using a different mechanism.

---

## 2.8a Cross-org rollup for multi-org account owners

Now that one account can own more than one organization (Doc 01
§1.3.13), an owner running two related businesses wants a combined
glance without having to switch back and forth. The **"Vue d'ensemble"**
screen shows every org the user _owns_ (not orgs they're merely a
member of) side by side — active projects, this week's advances,
tomorrow's dispatch status, pending request counts — each figure
independently fetched per org and composed in the UI, never blended
into a single misleading number that would conflate two separate
legal businesses' finances (Doc 01 §1.17 has the full mechanics and
why it's built this way rather than as a single cross-tenant query).

---

## 2.8b Multi-project rollup dashboard (resolves the Phase 6+ roadmap line)

§2.10's "multi-project rollup dashboards" line originally had no further
spec anywhere in this document set — resolved during Phase 6 build, not
invented after the fact without confirmation. This is a THIRD, distinct
axis of "rollup," easy to conflate with the other two:

- §2.8's `budget_rollup_opt_in` — per-**project** visibility, shared
  _across orgs_ that are members of the same project.
- §2.8a's Vue d'ensemble — per-**owned-org** summary, across _multiple
  orgs_ one account owns.
- This section — per-**org** summary, across _multiple projects_ that one
  org leads. The one combination the other two don't cover.

Shows every non-deleted project the active org leads, each as an
independent card: budget consumed % (same definition as the per-project
Dépenses screen — all-time `project_expenses` sum vs. `budget_total`,
advances excluded per Doc 01 §1.14.2, so a project never shows two
different consumed-% figures on two screens), workers dispatched today,
and pending material requests. Figures are fetched and shown per-project,
never summed into a single cross-project total — same reasoning as §2.8a:
a blended number across projects with different clients/budgets would be
more misleading than useful.

---

## 2.9 AI roadmap — Tier 0 / 1 / 2

Renamed from an earlier ambiguous "AI-phase / build-phase" numbering
that collided with the build roadmap's own phase numbers (§2.10).

- **Tier 0** — zero ML dependency. Deterministic SQL pattern detection (e.g. dispatch lateness patterns, §2.2), now actually **surfaced to the contractor** on the Worker Detail screen (Doc 01 §1.18) rather than only collected silently — data collection without a UI was a gap this rework closes, not new scope. Ships with MVP; data collection for later tiers begins here.
- **Tier 1** — lightweight statistical models on top of Tier 0's collected data (e.g. predictive advance-request likelihood). Post-MVP.
- **Tier 2** — custom ML, no third-party LLM APIs (an earlier resolved decision, unchanged). Deferred furthest out; the product is never blocked on Tier 2 slipping since Tier 0 has no dependency on it.

---

## 2.9a Daily/weekly digest notifications

Opt-in (off by default), configured in Settings → Notifications:
pending advance/material request counts, whether tomorrow's dispatch
is planned yet (the single highest-value line — an unplanned next day
is worth a nudge before end of day), and the week's running advances
total. Delivered via email and push, whichever channel the user
actually engages with (Doc 01 §1.19 has the full scheduling and
delivery mechanics). This is a retention feature aimed squarely at an
owner who doesn't want to open the app constantly to stay on top of
things — the same "numbers over words" principle (Doc 00 §0.6) applied
to a notification instead of a screen.

---

## 2.10 Build roadmap — updated for the auth and web-parity decisions

The prior roadmap sequenced web behind mobile, module by module. That
sequencing is now wrong given full web parity — a module isn't "done"
until it ships on both platforms, so phases are scoped by module, with
mobile and web built in the same phase.

**Phase 0 — Foundations**: monorepo setup, design system (built with
RTL-safe logical properties from the start, Doc 00 §0.6), Supabase
project, shared Zod validation package, the table-lookup-only RLS
pattern with its supporting indexes (Doc 01 §1.5), the
`idempotency_keys` and `scheduled_job_runs` tables (Doc 01 §1.11/§1.13),
the `app_versions` table and mobile Forced-Update gate (Doc 01 §1.8),
the free-tier keep-alive ping job (Doc 01 §1.10), and — because it's
now shared infrastructure both clients need before anything else
works — the full email + password auth flow (sign-up, verify, login,
forgot/reset) on **mobile and web simultaneously**. This is a change
from the prior "Phase 1 order: auth → dispatch → advances" language —
auth, plus this set of cross-cutting technical foundations, now sits in
Phase 0 because each is a hard blocking dependency for both clients,
not a first feature within Phase 1. It's more up-front work than the
prior roadmap implied, but every one of these is materially cheaper to
build once than to retrofit after Phase 1–4 screens already exist.

**Phase 1 — Dispatch & roster**: dispatch board, vehicle management,
worker roster and invitations (mobile + web), worker mobile app's
check-in/check-out flow (mobile only, since workers have no web
surface), manual attendance/Pointage (mobile + web, Doc 01 §1.14.3) —
built alongside dispatch since payroll in Phase 2 depends on
`attendance_records` existing as a complete source, not just the
dispatch-derived subset of it.

**Phase 2 — Advances & payroll**: contractor advance/payroll screens
(mobile + web), worker advance-request and salary-view screens (mobile
only), project expense ledger / Dépenses (mobile + web, Doc 01 §1.14) —
scheduled here rather than Phase 3 since it's the direct fix for the
budget-consumed gap and naturally sits next to the other money-tracking
screens being built in this phase. Optional 2FA enrollment (Doc 01
§1.15) also ships here, alongside the rest of this phase's money-moving
surface.

**Phase 3 — Materials, site logs, safety, insurance, client portal**:
contractor-side screens on mobile + web; worker-side capture (material
request, update chantier) mobile only; client portal as its own
minimal surface.

**Phase 4 — Multi-org collaboration**: invite/accept flow, visibility
layers, report branding, budget rollup, cross-org rollup for multi-org
owners (Doc 01 §1.17 — grouped here since both concepts revolve around
"more than one organization," even though the underlying mechanisms
are unrelated, per §2.8's note distinguishing them) — mobile + web.

**Phase 5 — Reports & billing, Platform Admin, Tier 0 AI**: exports,
subscription/billing screens (mobile + web), the full Platform Admin
application (Doc 04 §4), Tier 0 pattern-detection data collection
begins and its Worker Detail surfacing ships (Doc 01 §1.18), daily/
weekly digest notifications (Doc 01 §1.19), self-service data export
and the project/worker Trash screen (Doc 01 §1.16).

**Phase 6+ — Tier 1/2 AI, professional features**: legal contract
templates (pending legal review — still deferred, needs an actual
lawyer, not a product/engineering decision), multi-project rollup
dashboards, ~~seat-based pricing~~ **seat-based pricing: decided and
built** (Doc 01 §1.20, migrations 0043–0044) — a seat is an
owner/manager account, Konnect integration stands behind a
payment-provider abstraction (Stripe test mode until Konnect's merchant
KYC clears), past-due orgs downgrade to a capped free tier rather than
being locked out. Tier 1 AI remains genuinely blocked — not on a
decision, but on real accumulated usage data existing at all.

**Honest cost note**: shipping every contractor module on two clients
in the same phase, rather than staggering web behind mobile, increases
UI implementation time per phase — this was an explicit trade the
product owner chose knowingly (Doc 00 §0.4), not a free upgrade. The
shared backend, shared validation, and shared RLS (Doc 01 §1.5–1.6)
are what keep the _rules_ consistent even though the _screens_ are
built twice.

---

## 2.11 Testing strategy

| Layer                      | Tool                                                                                                                                                                  | Notes                                                                                                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                       | Jest                                                                                                                                                                  | Shared Zod schemas tested once, trusted by both clients.                                                                                                                                                                                                                                        |
| Mobile E2E                 | Detox                                                                                                                                                                 | Contractor + worker flows.                                                                                                                                                                                                                                                                      |
| Web E2E                    | Playwright                                                                                                                                                            | Contractor flows — now covers the full module set per §0.4's parity matrix, not just reporting screens as in the prior scope.                                                                                                                                                                   |
| RLS / security             | Doc 01 §1.5's test matrix, run against real seeded data before any multi-org or auth change ships                                                                     | Cross-org isolation is the single highest-severity thing to regress. Includes a specific test asserting a permission change (role demotion, project-membership revocation) takes effect on the _very next request_, to guard against any future regression back toward JWT-claims-based checks. |
| Idempotency                | Integration test firing the same request twice with the same `Idempotency-Key`                                                                                        | Asserts exactly one financial write occurs (Doc 01 §1.11), not "eventually consistent" — a hard assertion.                                                                                                                                                                                      |
| Offline conflicts          | Detox test simulating two concurrent edits to one dispatch cell, one offline                                                                                          | Asserts a `409` surfaces the explicit keep-mine/use-theirs choice (Doc 01 §1.9) rather than silently merging.                                                                                                                                                                                   |
| App version gate           | Unit test on the Splash routing logic with a mocked stale `build` number                                                                                              | Asserts routing to Forced Update happens before any session check runs (Doc 01 §1.8).                                                                                                                                                                                                           |
| Admin                      | Playwright, separate suite                                                                                                                                            | Runs against the isolated Admin deployment only. Includes a dedicated impersonation test asserting scope is limited to the target user's own permissions and that every impersonated action is tagged in `audit_log` (Doc 04 §4.3.3a).                                                          |
| Attendance reconciliation  | Integration test writing a manual attendance record, then a dispatch check-in for the same worker/day                                                                 | Asserts the manual entry is preserved, not silently overwritten (Doc 01 §1.14.3) — and, as of Phase 13, that the `attendance_effective` view (migration 0036) actually resolves the conflict in favor of the manual row, regardless of insert order.                                            |
| Expense/budget calculation | Unit test on the consumed-% formula                                                                                                                                   | Asserts advances are never included in the sum (Doc 01 §1.14.2) — the specific double-counting bug this design avoids.                                                                                                                                                                          |
| Cross-org rollup isolation | Integration test asserting the rollup screen's per-org data never appears in a query that spans both orgs at the database layer                                       | Directly guards the "no super-owner" constraint (Doc 01 §1.17.1) — this is a regression test for a principle, not just a feature. **Built Phase 13** (`apps/mobile/src/test/rollup/`).                                                                                                          |
| Soft-delete / restore      | Integration test: delete a project, assert it's excluded from normal queries but restorable within 30 days, then assert `purge_soft_deleted_records` removes it after | Doc 01 §1.16.2. **Built Phase 13** (`apps/mobile/src/test/soft-delete/`).                                                                                                                                                                                                                       |
| 2FA enrollment/login       | Detox + Playwright test covering the full opt-in enroll → logout → login-with-TOTP cycle                                                                              | Doc 01 §1.15 — since this is opt-in, also asserts a non-enrolled account's login is entirely unaffected.                                                                                                                                                                                        |

**Mobile implementation status (as of Phase 12)** — this table is the
target strategy; for what's actually built in `apps/mobile` against it,
see `docs/MOBILE_IMPLEMENTATION_STATUS.md`'s Phase 9/11/12 sections
rather than duplicating a status tracker here. Short version: Jest and
Detox infrastructure exist since Phase 9 (unit coverage for the expense
consumed-% formula row and the app-version-gate row, a real Detox spec
for the 2FA row). Phase 9 flagged the RLS/security, idempotency,
offline-conflicts, and attendance-reconciliation rows as blocked on
fixture infrastructure that didn't exist. Phase 11 built that
infrastructure and the RLS/security row (`apps/mobile/src/test/rls/`,
run via `pnpm test:rls`), stopping there deliberately.

Phase 12 adds the idempotency and attendance-reconciliation rows, each
with its own fixture module rather than reusing `rls/fixtures.ts` (that
module's 3-org/4-user graph is sized for cross-org isolation, not
needed here) — `apps/mobile/src/test/idempotency/` (targets
`create_advance`, migration 0019; confirmed by reading the mobile code
first that `advances.tsx` has real idempotency wiring and `expenses.tsx`
has none, so advances — not expenses — is the correct target for this
row) and `apps/mobile/src/test/attendance/` (writes a manual
`attendance_records` row, then a `dispatch_checkin` one, for the same
worker/day). Both now run via the same `pnpm test:rls` script (the
underlying Jest config's `testMatch` was widened; the script name
itself was left unchanged deliberately). Same disclosed limitation as
Phase 11's RLS suite: written and checked against the actual schema,
but not executed against a live instance — no local Supabase available
in that session either.

One honest scope note on the attendance-reconciliation row specifically:
reading `pointage.tsx` and `(worker)/home.tsx` before writing this
test surfaced that "the read side prefers manual_pointage over
dispatch_checkin on conflict" is stated as intent in both screens' own
comments, but no shared resolver function implementing that preference
actually exists anywhere in the codebase — each screen just reads/writes
its own rows independently. The Phase 12 test therefore verifies what's
actually true and testable today (the DB-level guarantee: a later
dispatch check-in can never mutate or delete an earlier manual row,
since `attendance_records` has no UPDATE/DELETE policy at all — it's
append-only by design, migration 0007), not a UI-level resolution
behavior that was never built. That gap — no actual resolver — is real
and still open; it wasn't invented for this note.

**Phase 13 closes that gap** — see decision #25 (Doc 00 §0.5) for the
full account. Short version: `attendance_effective` (migration 0036)
implements the preference server-side as a view; five mobile screens and
one shared Edge Function (three report types) were switched to read it,
three of which had a genuine double-count bug beyond what the "no
resolver" note above described (worst case: `advances.tsx`'s payroll
figure, `generate-report`'s payroll/CNSS reports). The
attendance-reconciliation suite's fixture module gained a second
describe block asserting the view itself, alongside the original
append-only-guarantee block from Phase 12 (kept, still true, still worth
asserting directly). Phase 13 also built the two remaining rows from
this table that had no attempt yet — soft-delete/restore
(`apps/mobile/src/test/soft-delete/`) and cross-org rollup isolation
(`apps/mobile/src/test/rollup/`) — each its own minimal fixture module,
same pattern as every suite since Phase 12. All five DB-integration
suites now run via the same `pnpm test:rls` script; NONE has been
executed against a live instance in any session yet — same disclosed
limitation as always, not glossed over for having grown to five.

Offline-conflicts remains not yet built — it needs this same fixture
foundation but is explicitly blocked behind Detox itself being confirmed
to run at all first (still unconfirmed as of Phase 13; see
`docs/MOBILE_IMPLEMENTATION_STATUS.md`). The Playwright/web and Admin
rows are out of scope for this document entirely (web/admin are
separate branches/apps).

---

## Post-roadmap Implementation Addendum (Gap-Fix Phases 1–12)

_Added retroactively. The roadmap sections above predate a full second
implementation pass that shipped 12 further gap-fix phases against this
same spec (see `docs/MOBILE_IMPLEMENTATION_STATUS.md`'s "Gap-Fix Roadmap
Track" for the full detail). Summarized here by feature area rather than
by phase number, since the phase numbering is its own separate track._

- **Analytics** (new `analytics.tsx` screen): financial (cost-per-project,
  budget-vs-actual) and operational (headcount trend, safety severity by
  month) charts, computed read-only from existing tables — no new schema.
  Chart primitives only support single-series bar/line, so grouped views
  are built by stacking multiple chart instances rather than a native
  grouped/stacked chart type.
- **Client-facing invoicing**: a new anonymous portal route generates and
  serves a PDF invoice from a frozen expense-line-item snapshot (§1.20.1).
- **Weather widget**: dashboard integration via Open-Meteo (no API key
  required), lowest priority item in its phase.
- **In-app feedback**: a dedicated `feedback.tsx` screen, separate from any
  support-ticket system (none exists).
- **Push notifications**: dispatch/material/safety events now reach a
  worker's device via Expo push, with deep-linking so tapping the
  notification opens the relevant record directly.
- **Smart input pickers**: a shared bottom-sheet `Select.tsx` component
  (pick-or-specify, "Autre — préciser" free text) replaces several ad hoc
  text inputs (trade type, worker trade, insurance type, incident type,
  materials, absence reason) app-wide.
- **History & correction**: site logs and attendance records both gained
  30-day-recoverable soft-delete/restore and edit-in-place correction,
  with a visible "Corrigé" indicator when a later record conflicts with
  an earlier one for the same worker/date.
- **Photo infrastructure**: every entity that plausibly needed a photo
  (vehicle, worker, project cover, expense receipt) now has one — this
  was previously blocked for the entire project's history by the fact
  that no Supabase Storage bucket existed anywhere in the repo (fixed
  with a shared `org-files` bucket).
- **Complete profiles**: RIB (bank account, Vault-encrypted — see Doc 01
  §1.20.1 for the unresolved bootstrap blocker), emergency contact, job
  title, hire date for individuals; legal form, workforce size, socials,
  service area for organizations; a profile-completion checklist mirrors
  the existing org-completion-nudge pattern.
- **Interaction polish**: per-screen (not uniform) search, org logo on the
  client portal, undo-toast for lower-stakes deletes (vehicle, expense),
  accessibility label pass.
- **Launch readiness**: rate limiting on invite-accept Edge Functions,
  Sentry error tracking, biometric app-lock, OTA update checking, a
  first-run onboarding checklist, and two verification runbooks
  (`docs/SYNC_VERIFICATION_RUNBOOK.md`, `docs/DETOX_VERIFICATION.md`).

**Still not built / still blocked**, unchanged from this document's
existing "Deferred" callouts: Tier 1 AI (needs real accumulated usage
data), legal contract templates (needs a lawyer, not an engineering
decision), a uniform cross-screen search layer (deliberately scoped
per-screen instead — see Doc 01 §0.9), Detox actually run against a real
device (a runbook exists; execution does not).
