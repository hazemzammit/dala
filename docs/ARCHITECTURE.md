# Architecture

This is the "why is it structured this way" companion to `docs/spec/`. The
spec describes the product; this describes the code layout that implements
it. Full detail always lives in the spec — this is a map, not a duplicate.

## Monorepo shape

pnpm workspaces + Turborepo. Three deployable apps, four shared packages:

```
apps/mobile   → Expo/React Native, contractor + worker
apps/web      → Next.js 14, full contractor parity (Doc 00 §0.4)
apps/admin    → Next.js 14, separate deployment, Platform Admin only
packages/shared-types   → TS interfaces mirroring the DB schema
packages/validation     → Zod schemas — single source of truth for valid input
packages/design-tokens  → colors/type/spacing/motion — single source of truth for visuals
packages/config         → shared Tailwind preset, lint/tsconfig bases
```

**Why `admin` is a separate app, not a route group inside `web`**: Doc 01
§1.1 requires it to be a different deployment, different domain, different
env vars, different CI pipeline — "so an Admin deploy can never accidentally
ship to the contractor surface or vice versa." A route group inside one
Next.js app can't give you that isolation; a separate app in the same
Turborepo can, while still sharing every package.

**Why mobile and web don't share UI components directly**: Tamagui (mobile)
and Tailwind/shadcn (web) are different rendering targets. What's shared
instead is everything _behind_ the UI — the design tokens both consume, the
validation both run, the types both use, and the RLS-enforced backend both
call. Doc 00's whole "one product, two surfaces" claim rests on that shared
layer, not on shared JSX.

## The one authorization pattern

Every table with sensitive data has RLS enabled, and every policy is built
from exactly three SQL functions defined once in
`supabase/migrations/0005_rls_helper_functions.sql`:

- `is_org_member(org_id)`
- `org_role_of(org_id)`
- `is_project_member(project_id)`

**There is no other way to check permissions in this codebase.** Not a JWT
claim, not a hand-rolled `EXISTS` query, not a client-side check that
happens to look right. Doc 01 §1.5 explains why in detail — the short
version: JWT claims go stale for up to an hour (the access-token lifetime),
and this product's multi-org membership churns constantly (invites
accepted, roles changed, orgs suspended) — a stale claim would silently
permit actions that should already be blocked.

If you're writing a new migration and reach for anything other than these
three functions, stop and re-read Doc 01 §1.5 first.

**A `security definer` RPC's own internal checks can be narrower than the
table's RLS policies, and that gap can silently block a legitimate caller.**
`site_logs`' RLS insert policy is `is_org_member(org_id)` — any org member,
including the owner — but `submit_site_log_entry()` (the only insert path;
`site_logs` is append-only, so nothing ever calls a bare `insert` on it
directly) additionally required a `workers` row for `auth.uid()`, which an
org owner/contractor never has. RLS being permissive doesn't mean the write
path is — migration `0069` (improvement-plan Phase 2) is the fix and the
reference example: when a `security definer` function's `declare`/`begin`
block resolves "who is calling this" more narrowly than its table's RLS
policy allows, check that function's own logic, not just the policy, before
assuming a new caller can use an existing write path.

**A table with NO RLS write policy at all still needs a `security
definer` RPC to gate its writes — the gating just moves entirely into
the function body.** `site_logs` is append-only by design (0008) and
carries no UPDATE/DELETE policy whatsoever — not a narrow one, none.
Migration `0072` (improvement-plan Phase 6)'s `soft_delete_site_log` /
`restore_site_log` / `update_site_log_caption` gate entirely inside each
function (`logged_by = auth.uid()` OR `org_role_of(org_id) in ('owner',
'manager')`), using the same two primitives this section opens with —
still no fourth permission mechanism invented, just applied inside
`plpgsql` instead of a `create policy` statement, because there is no
policy for it to extend.

## Migrations are the schema's only history

`supabase/migrations/` is numbered and sequential. Nobody hand-edits the
schema in Supabase Studio for anything meant to persist past a local
experiment. New tables/columns get a new migration file; `supabase db push`
(cloud) or `pnpm db:reset` (local) applies them in order. This is what lets
two people's local databases, staging, and production all agree on exactly
the same schema history instead of drifting.

Migrations are also **additive-only** once something ships (Doc 01 §1.8):
never drop or rename a column a shipped mobile client still reads without a
deprecation window, since mobile updates go through app-store review and
some users never update at all.

## Shared packages are the drift-prevention mechanism

Doc 00 §0.7 names "web/mobile feature drift" as a real risk and names the
mitigation structurally: one backend, one validation package, one RLS
layer. Concretely:

- Before writing a new form, check `packages/validation/src/*.ts` for an
  existing schema. A near-duplicate schema written directly in a screen
  file is exactly the drift this package exists to prevent.
- Before hand-typing a table's shape, check `packages/shared-types/src/index.ts`.
- Before hardcoding a hex/px value, check `packages/design-tokens/src/index.ts`.

## UI component inventory: what exists before writing a new one

Before building a one-off picker, sheet, or input component, check
`apps/mobile/src/components/ui/` for an existing one:

- **DatePicker.tsx** — date-only bottom-sheet picker (backward-only variant
  via `maximumDate`); call sites: `pointage.tsx`, `expenses.tsx`,
  `projects.tsx`, `[id].tsx` (project detail), `organization-settings.tsx`.
- **Select.tsx** (Phase 4) — pick-or-specify bottom-sheet with optional
  search-as-you-type (above 6 options), plus "Autre — préciser" revealing
  an inline text input. Accepts a plain `SelectOption[]` list; call sites:
  `organization-settings.tsx` (trade_type), `team.tsx` (workers.trade),
  `safety.tsx` (incident_type, coverage_type), `material-request.tsx`
  (materials.item), `pointage.tsx` (absence_reason). Option lists are
  centralized in `apps/mobile/src/lib/pickerOptions.ts`.
- **FormField.tsx** — labeled text input with optional error text.
- **SegmentedControl.tsx** — 2–4 option toggle, used for binary/ternary
  status fields (attendance status, incident severity, reminder on/off…).
- **Sheet.tsx** — the shared bottom-sheet host (used by DatePicker,
  Select, and every manual "create" form in the app).
- **WorkerHubTabs.tsx** (Phase 6, `components/worker/`) — small 2–4 label
  navigational tab bar; same visual chrome as `SegmentedControl.tsx` but
  no per-option `color` (nothing to color-code on a plain tab switcher).
  Use this, not `SegmentedControl`, for navigational tabs; use
  `SegmentedControl` when each option is a real state with its own
  meaningful color. Call sites: `worker/[id].tsx`'s 4-tab hub,
  `vehicle/[id].tsx`'s 2-tab hub (Phase 8 — despite the component's
  worker-specific name, it takes a plain `{value,label}[]` and is fully
  reusable as-is; confirmed by reading it before reusing it, no changes
  needed to the component itself).
- **Progress.tsx** (`ProgressBar`/`ProgressRing`, Phase 24) — green/amber/
  red threshold bar (`value: number`, 0–100+). Call sites: `expenses.tsx`/
  `projects.tsx` ("budget consommé"), `vehicle/[id].tsx`'s Documents tab
  (Phase 8 — document/insurance due-soon indicator, days-until-expiry
  mapped onto the same 0–100+ scale via that file's own
  `expiryProgressPercent()`, not a literal percent-of-anything).
- **AttendanceHistory.tsx** (Phase 6, `components/attendance/`) —
  read-only, date-grouped attendance audit view over
  `attendance_effective` + raw `attendance_records`, with an optional
  `workerId`/`lockToWorker` per-worker mode. Call sites:
  `attendance-history.tsx` (org-wide, from `pointage.tsx`'s header icon),
  `worker/[id].tsx`'s Pointage tab (locked to one worker).
- **ChartCard.tsx** (Phase 7, improvement-plan) — the shared card chrome
  (title + optional subtitle disclosing a chart's trailing window +
  children) wrapping every `Chart.tsx` chart. Factored out once
  `analytics.tsx` needed the same `YStack backgroundColor="$neutral0"
borderRadius="$card" padding="$4"` + uppercase-label `Text` shell eight
  times in one screen — the exact repeated-chrome case this inventory's
  own "check before writing a new one" note exists to catch. Use this for
  any future chart-in-a-card; don't hand-roll the wrapper again.

- **ProfileScreen.tsx** (Phase 10, `components/profile/`) — the unified
  "my own profile" screen, §4.1 step 3's resolution: one component,
  parameterized by `role: 'contractor' | 'worker'`, rendered as a full
  screen by both `profile-settings.tsx` and the new `(worker)/profile.tsx`.
  Same layout (photo, name, role/trade + join/hire date, phone, email,
  emergency contact, completion checklist, verification signals) with
  disclosed role-conditional pieces — see the component's own header for
  exactly which pieces vary (phone/email tap-to-edit stays
  contractor/manager-only, unchanged from Phase 3's own scope boundary).
  `organization-settings.tsx` is NOT folded into this component — an
  organization isn't a person; its own new §4.2 fields stay on that
  screen. Use `ProfileScreen`, not a third copy of this form, for any
  future role that needs "my own account" (the plan's own wording flags
  a client-portal contact as a likely future consumer).

- **UndoToast.tsx** (Phase 11, improvement-plan §9.2) — a lighter,
  screen-local alternative to `Toast.tsx` for "lower-stakes delete"
  flows: shows a "Supprimé · Annuler" bar with a countdown-backed undo
  window, distinct from `Toast.tsx`'s own message-only, no-action,
  ToastProvider-mounted variants. NOT a singleton/context — each screen
  owns its own `useUndoToast()` state and renders its own `<UndoToast>`,
  since the thing being undone (which row, which restore RPC) is always
  screen-specific. TIMING MODEL: the real soft-delete already happened by
  the time this mounts — "Annuler" calls a `restore_*` RPC, it does not
  cancel a pending delete. Call sites: `journal.tsx` (site log delete,
  replacing the old `Alert.alert` confirm), `expenses.tsx` (expense row
  delete). Use this, not a third bespoke inline undo pattern, for any
  future "delete now, brief undo window" flow — `pointage.tsx`'s own
  "Marquer tous présents" 5s-undo predates this component and stays
  inline (it undoes purely local/optimistic state, never a real RPC
  round trip, so it doesn't need this component's async `onUndo` shape) —
  see that screen's own header, unchanged this phase.

Use the nearest existing component before reaching for a new one; a
near-duplicate component written in a screen file is exactly the drift
`Sheet.tsx` and `DatePicker.tsx`'s own documented pattern exists to prevent.

**When NOT to reuse `Select.tsx` (Phase 9 finding, reconfirmed Phase 10):**
`Select.tsx`'s "Autre — préciser" free-text row is unconditional — there's
no prop to suppress it — which is correct for the text-column fields it
already serves but wrong for (a) picking a foreign key (a free-typed
string isn't a valid `worker_id` — Phase 9's own finding) and (b) a column
with a real database CHECK constraint restricting it to a closed enum (a
free-typed value passes the picker but fails the constraint with a
confusing RPC error — Phase 10's own finding, `organizations.legal_form`/
`workforce_size_bracket`, migration 0075). `reports.tsx`'s payslip worker
picker (Phase 9) and `organization-settings.tsx`'s legal-form/workforce
chip rows (Phase 10) are both small purpose-built controls instead of
`Select.tsx`, for these two different reasons — see each screen's own
header. If a future field is either a foreign key or a CHECK-constrained
enum, don't force it through `Select.tsx`.

## Edge Function inventory: two export/report functions, not one

`DALA_GAPS_AND_FIXES_PLAN.md` §0 names this distinction as a guardrail
("don't conflate them") but, until this note (improvement-plan Phase 5),
it lived only in that plan doc and in the two functions' own file
headers — not here, where the rest of this page's "what exists before
building a new one" convention lives. Two `supabase/functions/` entries
both touch "get data out of the app," and they are NOT the same feature
under two names:

- **`generate-report`** — Doc 03 §3.20's curated, named reports (Rapport
  de progression, Résumé de paie, Résumé de sécurité), each scoped to a
  date range. Returns CSV or PDF (all three report types are PDF-eligible
  as of Phase 5 — logo-branded, chart-illustrated; see the file's own
  header for the full history). Meant to be read by a human — a
  contractor sharing a period's numbers with an accountant or a client.
- **`export-org-data`** — a full raw dump of the org's own data (Doc 02
  §2.10), CSV/JSON of the org's own tables, not a curated report. Stays
  format-plain on purpose: a data export should return every underlying
  row for portability, not a resolved/presented view — deliberately left
  reading raw `attendance_records` rather than the de-duplicated
  `attendance_effective` view `generate-report` uses (see that function's
  own "PHASE 13 FIX" comment for why the two intentionally diverge here).

If a future report/export need doesn't obviously belong to one of these
two, that's a sign it might be a third, genuinely new feature — not a
reason to bend either function's existing scope.

**Phase 9 adds a third document-producing function, `generate-invoice-pdf`
— still not the same feature as the two above.** It doesn't return CSV,
isn't scoped to a date-range "report," and (unlike both functions above)
has TWO auth paths — an authenticated org member, or an anonymous
token+PIN client-portal caller (see that function's own header). It
shares only the logo/branding helper with `generate-report`
(`_shared/pdfBranding.ts`, extracted this phase — see below), not the
report-table/chart rendering machinery, which stays specific to
`generate-report` because an invoice's layout (line items + a totals
footer) is genuinely different from a report table.

## Event-driven push notifications: triggers, not in-RPC calls

Phase 9 (§2.1/§2.2) needed "fire an instant push the moment X happens,"
for X in {a dispatch assignment is created, a material request is
created, a safety incident is logged}. The natural first instinct — "call
Expo's push API from inside whichever RPC creates the row" — doesn't
work here, because none of those three writes goes through a single RPC:
`dispatch_assignments` and `materials` are both written via a plain
`.insert()`/`.upsert()` from EITHER an online screen call OR a
WatermelonDB offline-sync push (`pushChanges.ts`), and `safety_incidents`
is a plain online-only `.insert()`. There is no one function to hang a
push call off of.

This is exactly the shape Phase 8's `org_activity_feed` trigger design
already solved — see this file's own migration-comment precedent — so
migration `0074` reuses it: an `AFTER INSERT` trigger on each of the
three tables, calling a shared `send_expo_push()` helper that hits Expo's
push endpoint via `net.http_post` (already a dependency of this project —
0026/0027/0030 all use it from `pg_cron`, and 0028's
`request_phone_change()` already establishes that `net.http_post` can be
called directly and synchronously from inside a plain function body, not
only from a scheduled job). **What's new here, disclosed as a real
divergence from Phase 8's own precedent**: those triggers only ever
insert a row into another table; these triggers make an outbound HTTP
call. `net.http_post` queues the request against `pg_net`'s background
worker and returns immediately, so this adds no meaningful latency to the
INSERT it's attached to — but it is a genuinely different kind of
side-effect for a trigger to have, worth knowing about if a future
migration reaches for this same pattern.

Invite creation (`invite_worker`, `invite_organization_member`) is
DELIBERATELY NOT wired to a push trigger — see migration `0074`'s own
Part 1 header for the full reasoning (no push token exists for the
invited person at creation time, for two different reasons depending on
which RPC).

## Client-facing surfaces need their own auth story — RLS doesn't apply

Every other read in this app is scoped by `auth.uid()` through RLS. A
client viewing their project's portal (Phase 9 §2.5,
`apps/web/src/app/portail/[token]/page.tsx`) has no Supabase session at
all — there's no `auth.uid()` for RLS to check membership against. This
product's answer, established by `get_worker_invitation_by_token` (0017)
long before this phase and reused by `verify_client_portal_access`/
`verify_client_portal_invoice` (0074): a `SECURITY DEFINER` RPC, granted
to the `anon` role, that does its own scoping (a token lookup, here also
a PIN check + lockout) and returns only the fields the caller needs —
never a direct table grant to `anon`, and never RLS policies written to
accommodate an anonymous caller. If a future feature needs another
anonymous-facing read, this is the pattern to extend, not a new one to
invent.

## PDF-producing Edge Functions share branding, not layout

`supabase/functions/_shared/pdfBranding.ts` (Phase 9) holds
`fetchLogoAsset`/`embedLogo` — the "read this org's logo out of storage
and fit it in a box" logic every branded PDF needs, extracted out of
`generate-report` once a second PDF-producing function
(`generate-invoice-pdf`) needed the identical behavior. Each function's
own page layout (`buildReportPDF`'s table+chart pages, `buildPayslipPDF`'s
pay-stub breakdown, `buildInvoicePDF`'s line-item table) stays local to
its own file — those are genuinely different documents, and forcing them
through one shared "PDF body" function would mean threading
report-specific concepts through callers that don't have them. Before
adding a fourth PDF-producing function, check `_shared/pdfBranding.ts`
first; don't re-fetch/re-embed a logo from scratch.

## Money-moving actions are idempotent by construction

`packages/validation/src/money.ts`'s schemas all require an
`idempotency_key` (client-generated UUID). The server-side handler checks
`idempotency_keys` (migration `0010`) before processing — a retried request
returns the cached result instead of double-processing a payment. This is
mandatory for: advance creation/approval, "mark cycle as paid," Konnect
payment-initiation, invoice generation (Doc 01 §1.11.3).

Phase 8 (improvement-plan §1.9) adds `approve_material_request()`
(migration `0073`) to this list — disclosed as a judgment call, not a
literal reading of §1.11.3, whose list predates `materials` having a
`cost` column at all. Once approval can push a `project_expenses` row,
the same double-tap/retry risk the endpoints above protect against
applies here too, so it's built the same way (idempotency-key-gated,
mirrors `approve_advance`'s shape exactly). `refuse`/`reassign` on the
same table are deliberately NOT idempotency-gated — neither moves money,
same reasoning that already exempts every non-financial write elsewhere
in this list.

## Mobile data-fetching: React Query, adopted incrementally

`@tanstack/react-query` was an installed, unused dependency until
`docs/PHASE_1_BRIEF.md` (improvement-plan Phase 1). One `QueryClient`
(`apps/mobile/src/lib/queryClient.ts`), provided once in `app/_layout.tsx`.
Two RN-specific wiring calls that have no browser equivalent — `onlineManager`
reading NetInfo, `focusManager` reading `AppState` — are required for React
Query's `refetchOnReconnect`/`refetchOnWindowFocus` to do anything at all on
a native app; see that file's own header.

This is a screen-by-screen migration, not a rewrite — Phase 1 moved two
screens (`vehicles.tsx`, `pointage.tsx`) as the first slice; most screens
still use the pre-existing `useFocusEffect` + `useState` + `load()` pattern
and will move over in later phases, not in one pass. When migrating a
screen, use a query key shaped `[entity, orgId]` (or `[entity, orgId,
...scope]` when the data is further scoped, e.g. `['attendance', orgId,
date]`) — screens sharing an entity should share its key, so a mutation on
one screen can `invalidateQueries` and have every screen holding that data
refetch, without a manual reload call or navigation-event coupling between
them. `isLoading`/`isError`/data now map onto
`SkeletonList`/`ErrorState`(`components/ui/ErrorState.tsx`)/real content —
the three states a data-fetching screen should always visibly distinguish
between (Phase 1, previously only Skeleton and "loaded" existed; a failed
fetch had no dedicated UI).

Local component state that represents in-progress user input (a form draft,
unsaved toggles) stays local `useState`, not `useQuery` — `pointage.tsx`'s
header covers a specific gotcha here: a background refetch of cached server
data must not silently overwrite edits the user has already made but not
yet saved.

## Offline-sync conflict UX: what's actually built vs. what's still unverified

Improvement-plan §9.3 asked this phase to either defer sync-conflict UX
(its own stated prerequisite, live-device WatermelonDB verification, is
unmet — P1-V1/P1-V2 have carried forward `[unverified]` through every
brief since Phase 1) or make an explicit, disclosed policy decision
anyway. FINDING, disclosed rather than assumed from the plan's own
framing: reading `apps/mobile/src/db/sync/conflictResolver.ts`,
`pushChanges.ts`, and `components/dispatch/DispatchConflictsSheet.tsx`
before writing anything showed this is **largely already built**, not a
green field:

- Of the five WatermelonDB-synced tables (`dispatch_assignments`,
  `attendance_records`, `advances`, `materials`, `site_logs`), only
  `dispatch_assignments` is genuinely editable after creation — the other
  four are append-only by construction (confirmed by reading
  `pushChanges.ts`'s own explicit rejection of UPDATEs to those tables,
  not assumed). An append-only row has no concurrent-edit conflict to
  resolve; there is nothing for "last-write-wins vs. something smarter"
  to decide for those four, because two offline actors can each create a
  new row, but neither can ever overwrite the other's.
- `dispatch_assignments` — the one table where two people editing the
  same record while one was offline is a real scenario — already has a
  version-column optimistic-concurrency check (`conflictResolver.ts`)
  and a real UI for it: `DispatchConflictsSheet.tsx`, wired into
  `dispatch.tsx` behind a conflict-count badge (confirmed reachable by
  grepping for its own import/usage before concluding this). This is not
  a stub — it's the disclosed, explicit, non-silent handling §9.3 asks
  for, built in an earlier phase.
- `workers` (the plan's own illustrative example — "two people editing
  the same worker's rate") is NOT one of the five synced tables at all.
  Worker edits go through live `supabase` calls from `team.tsx`, never
  through WatermelonDB. A concurrent edit there is ordinary last-request-
  wins at the database level, the same as any two browser tabs racing a
  plain UPDATE — not a sync-engine conflict, because there is no local
  offline copy of a worker row to go stale in the first place.

**Explicit policy, stated once here rather than left implicit in code
comments across four files:**

| Table                                                                                 | Offline-editable after creation?             | Conflict policy                                                                                                     |
| ------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `dispatch_assignments`                                                                | Yes                                          | Version-column optimistic concurrency, explicit user choice via `DispatchConflictsSheet.tsx` — NOT last-write-wins. |
| `attendance_records`, `advances`, `materials`, `site_logs`                            | No (append-only)                             | No conflict is possible by construction; nothing to resolve.                                                        |
| Every other editable table (`workers`, `vehicles`, `projects`, `project_expenses`, …) | N/A — not routed through WatermelonDB at all | Ordinary online last-request-wins, same as any live-only web/mobile screen; not a sync-conflict question.           |

**What is still genuinely unverified, carried forward unchanged:**
`conflictResolver.ts`'s version-check logic and `DispatchConflictsSheet.tsx`
have never been exercised against a live two-device offline/online race —
P1-V1/P1-V2 (live-device WatermelonDB sync verification) remain
`[unverified]` this phase too, for the same standing reason every prior
brief gives (no Docker/live Supabase in this sandbox). This phase's
contribution is not "verification finally happened" — it's confirming
that the DESIGN decision §9.3 asks for already exists and is disclosed
here explicitly, rather than left as an implicit assumption resting on
scattered code comments.

## `db/index.ts` vs `db/sync/index.ts` — a content-swap bug, found twice, fixed once

This bug — `db/index.ts` (imported everywhere as `{ database }`) holding a stale copy of
the sync orchestrator instead of the real `Database`/adapter bootstrap, while `db/sync/
index.ts` (imported everywhere as `{ runSync }`) held an out-of-date version missing
Phase 1's sync-status wiring — was found and diagnosed independently in two places: a
Phase 12 pass through this codebase, and a separate fix session run directly against the
repo (see `dala-fixes-summary.md`, §4a) that reached the identical root-cause diagnosis
and an equivalent fix. The fix session's version is what's actually in this repo as of
this Phase 12 delivery — Phase 12 does not re-touch either file, to avoid clobbering
work already verified end-to-end (`pnpm --filter mobile typecheck` → 0 errors, per that
session's own verification). See each file's own header comment for the full trace.

The architectural point worth recording, independent of who fixed it: **these are
deliberately two separate files, not one.** `db/index.ts` owns the `Database`/adapter/
`modelClasses` construction — a singleton, imported by any screen that needs to
`.get()`/`.query()` a local collection directly. `db/sync/index.ts` owns the
`synchronize()` call, conflict flushing, and sync-status reporting — the orchestration
layer, imported only by trigger points (`AutoSync.tsx`) and screens that expose a manual
"sync now" affordance. Collapsing them into one file would couple "give me the local DB
handle" (needed everywhere, including outside any sync context) to "run a full sync" (a
much heavier, network-dependent operation) — keeping them apart is why `SiteLogForm.tsx`
can import `database` for a local read without pulling in the entire sync machinery's
import graph.

## Global error visibility — Sentry init, ErrorBoundary, GlobalErrorBridge (Phase 12)

Three new pieces, all added together since they only make sense as a set:
`lib/sentry.ts` (calls `Sentry.init()` — never called anywhere before this phase, so
every prior `Sentry.captureException` call was a silent no-op), `components/shell/
ErrorBoundary.tsx` (the only class component in the app — React requires it for render-
error catching), and `components/shell/GlobalErrorBridge.tsx` (bridges `lib/
errorStatus.ts`'s external store into a `useToast()` call). The precedent for future
work: any NEW global error-surfacing need should feed into `errorStatus.ts`'s
`reportFatalError()`, not invent a second toast-bridge mechanism — that store is
deliberately the single funnel for "something uncaught happened, tell the user
generically," decoupled from React so both `sentry.ts` (outside any component tree) and
`ErrorBoundary.tsx` (inside one) can both call into it the same way.

## OTA update channel convention (Phase 12, §6.4)

`expo-updates` is now a dependency, with `eas.json` defining three channels
(development/preview/production) matching the three EAS build profiles of the same
name. Any future change to `app.json`'s `runtimeVersion` policy or a native
dependency bump requires a new _native_ build before that channel's OTA updates can
target it — an OTA update can only patch JS/asset changes within the SAME
`runtimeVersion`, never a native change. `OtaUpdateChecker.tsx` is the single call site
that checks/applies an update (foreground-triggered, same shape as `AutoSync.tsx`) —
future code should not add a second update-check call site.

## Biometric app-lock gate (Phase 12, §6.6)

Device-local only, via `lib/biometricLock.ts` (SecureStore) — deliberately never a
server-synced preference (see that file's own header for why). `AppLockGate.tsx` is
mounted once at the root, above `<Stack>` in z-order. Precedent for any future
device-local-only preference: SecureStore, not a new `organizations`/`profiles` column,
unless the preference is genuinely meant to follow the account across devices.

| Question                                                             | Look here                                                                                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "What should this screen do?"                                        | `docs/spec/03-*.md` (mobile) or `04-*.md` (web/admin)                                                                                                                                                    |
| "What does the data model look like?"                                | `docs/spec/01-*.md` §1.2, then the actual migration files                                                                                                                                                |
| "What color/spacing/font do I use?"                                  | `packages/design-tokens/src/index.ts`                                                                                                                                                                    |
| "How do I validate this form?"                                       | `packages/validation/src/*.ts`                                                                                                                                                                           |
| "What TS type does this row have?"                                   | `packages/shared-types/src/index.ts`                                                                                                                                                                     |
| "Is this feature mobile-only, web-only, or both?"                    | `docs/spec/00-*.md` §0.4's platform scope matrix — the single authoritative source                                                                                                                       |
| "What phase does this belong to?"                                    | `docs/spec/02-*.md` §2.10 (original build phases) or `docs/PHASE_1_BRIEF.md`/`docs/PHASE_2_BRIEF.md` onward (post-launch gap-fix phases — see `PHASE_1_BRIEF.md`'s own note on the two numbering tracks) |
| "Does this screen fetch data with React Query or the older pattern?" | `docs/PHASE_1_BRIEF.md`'s migration-status list, until a later phase brief supersedes it                                                                                                                 |
