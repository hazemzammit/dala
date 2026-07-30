# Phase 5 delivery — Reports & billing, Tier 0 AI, Trash, digest notifications (mobile)

> **Correction (post-delivery):** the first pass of this delivery believed
> `0019_admin_roles_and_sessions.sql` / `0020_announcements.sql` existed as
> stale duplicates of `0021`/`0022` and deleted them, based on an
> accidentally-shared stale copy of `supabase/migrations`. A fresh copy of
> that folder was provided afterward and diffed directly against this
> delivery: those two files **do not exist in the real repo** — 0019/0020
> were always `0019_worker_self_access_and_payroll_rpcs.sql` and
> `0020_field_ops_worker_self_access_and_client_portal.sql`, both correct.
> **Nothing has been deleted in this corrected delivery.** Section 1 below
> is left in place but marked as superseded, rather than quietly rewritten,
> so the record of what happened stays honest.

## 0. Read this first — documentation gap, confirmed as you flagged

Doc 01 (`01-data-model-security-and-architecture.md`) stops at §1.13 in
what you gave me — confirmed by reading its actual current content before
writing anything. §1.16 (trash/export), §1.18 (Tier 0 AI), §1.19 (digest)
do not exist. I did **not** invent prose to fill that gap. Instead:

- For Tier 0 and digest, Doc 02 §2.2/§2.9/§2.9a describes the behavior
  concretely enough to build from directly (the exact "Ahmed is late by an
  average of 22 minutes on Mondays" example, the digest content list) —
  built against that wording.
- For self-service data export, nothing in what you gave me specifies
  format or scope at all. `data-export.tsx` and `export-org-data`'s scope
  (CSV/JSON dump of the org's own tables, owner/manager only) is a
  **proposal**, flagged as such in both files' headers — not spec.
- The uploaded `.docx` set (`00-index-and-resolved-decisions.docx` through
  `06-roadmap-ai-admin-testing-reference.docx`) is confirmed to be the same
  superseded "Tunisia Construction OS" document set flagged last session —
  different title, different numbering than your actual `docs/spec/*.md`.
  Ignored entirely; nothing here was built against it.

## 1. Real bugs found and fixed — SUPERSEDED, see correction notice above

- ~~**Migration numbering — actually fixed this time, not just flagged.**
  Phase 4's notes recommended deleting `0019_admin_roles_and_sessions.sql`
  and `0020_announcements.sql` (byte-identical to `0021`/`0022` except the
  header comment) but deliberately left the decision to you. Confirmed
  this phase they were **still present** — and confirmed the migration set
  as a whole genuinely does not run as long as both exist: `0021` reissues
  `ALTER TABLE organizations ADD COLUMN deleted_at ...` against a column
  `0019` already added, which errors outright on a real `supabase db push`
  through the full sequence. Since this phase's own `0025` needs the
  migration set to actually apply, I deleted the two stale files as part
  of this delivery (`0023`'s own header already names `0021`/`0022` as
  canonical, confirming which pair to keep). If you'd rather have kept
  that decision yourself, the diff is a two-file deletion — trivial to
  revert.~~ **This was based on a stale upload and was wrong — those two
  files never existed in the real repo. No deletion was actually needed,
  none has been made in this corrected delivery, and migration `0025`
  applies cleanly on top of the real `0024` without any prerequisite
  cleanup.**

- **`apps/mobile/src/app/(contractor)/expenses.tsx` — pre-existing
  `orgId` reference bug.** `tsc --noEmit` failed on this file before any
  of my Phase 5 changes: the submit handler referenced `orgId`, but the
  org id was only ever a local variable inside `load()`, never stored in
  state. Fixed by adding an `orgId` state variable, set in `load()`, with
  a null-guard before the insert. Not part of this phase's ask, but it
  was the one thing blocking a clean `tsc` run across the app, so fixed
  in place.

## 2. What's new

**Migration** `supabase/migrations/0025_phase5_trash_billing_tier0_digest.sql`:

- `workers.deleted_at` + `soft_delete_worker()` / `restore_worker()` +
  `active_workers` view — workers had no soft-delete at all before this
  (only `projects` did, since 0013). `purge_soft_deleted_records()`
  extended to also purge workers past 30 days.
- `profiles.expo_push_token` + `profiles.notification_prefs` (jsonb:
  per-category booleans + `digest_frequency`) — per-account, not per-org
  (checked `activeOrg.ts`/`myOrgs.ts` before deciding this; a digest
  shouldn't reset when you switch active org).
- `get_worker_lateness_pattern(worker_id)` — Tier 0, Doc 02 §2.2's exact
  example. Computed live from `dispatch_assignments.departure_time` vs.
  `actual_departure_time`, grouped by day-of-week, minimum 4 samples/day
  before a row is returned (so one noisy data point never reads as "a
  pattern"). No new tracking table — the data already existed.
- `get_digest_summary(org_id)` — pending advances/materials counts,
  whether tomorrow's dispatch is planned, week's approved-advances total.
  Backs the new digest Edge Function.
- `is_shared_site_log_file(path)` + an additive `storage.objects` SELECT
  policy — closes the cross-org photo/voice attachment gap **flagged in
  0024's own header** ("a cross-org project member can read a shared
  `site_logs` row but not its attachment"). Confirmed still open before
  fixing it. Fixed via a lookup function rather than changing the
  `org-files` path convention, so nothing already uploaded needs
  re-uploading.

**Edge Functions** (all new — none of these existed before this phase):

- `export-org-data` — self-service export, owner/manager only (proposed
  scope, see §0 above).
- `generate-report` — the four Doc 03 §3.20 report types, CSV only (see
  scope cut below).
- `send-digest-notifications` — **the first actual scheduled-job Edge
  Function in this repo.** Migrations 0013/0023 both describe "a cron
  Edge Function wrapping `scheduled_job_runs`" as an established pattern,
  and this phase's brief referenced Phase 0's "keep-alive ping" and
  Phase 3's "Storage-purge" as prior art — I listed `supabase/functions/`
  before writing this and confirmed **none of those three exist as code
  anywhere**, only as comments describing intent. This file is the first
  real implementation of that pattern, not a reuse of working code. Worth
  knowing before assuming those other two jobs can be pointed to as a
  template — they can't; they were never built.

**Types & validation**: `Worker.deleted_at`, `Profile.expo_push_token` /
`notification_prefs`, `WorkerLatenessPattern`, `DigestSummary`,
`TrashItem` (`packages/shared-types`); `notificationPrefsSchema`,
`registerPushTokenSchema`, `generateReportSchema`, `requestDataExportSchema`
(`packages/validation`, two new files: `notifications.ts`, `exports.ts`).

**Screens**:

- `(contractor)/trash.tsx` — new. See scope note below.
- `(contractor)/worker/[id].tsx` — new. **First dynamic route
  (`expo-router`'s `[id]` convention) anywhere in this app** — no prior
  screen (including `projects.tsx`) established this. Deliberately
  minimal: identity header + the Tier 0 lateness card, nothing else. See
  judgment call below.
- `(contractor)/billing.tsx` — built out (was a stub since Phase 0). See
  scope split below.
- `(contractor)/reports.tsx` — built out (was a stub). CSV only.
- `(contractor)/data-export.tsx` — new.
- `(contractor)/notification-settings.tsx` — new. Digest + per-category
  push toggles.
- `(contractor)/team.tsx` — updated: queries `active_workers` instead of
  `workers`; each row now has a delete action (soft-delete + confirm
  dialog) and navigates to the new Worker Detail screen on tap.
- `(contractor)/settings.tsx` — one link added to the new Notifications
  screen. Otherwise unchanged/still a stub (see scope cut below).
- `apps/mobile/src/lib/pushNotifications.ts` — new. First code anywhere
  in this app that actually requests notification permission / stores a
  token (`expo-notifications` was already a dependency, unused until now).
- `apps/mobile/src/components/ui/illustrations.ts` — three new registry
  entries: `clean-up`, `export-files`, `push-notifications`.
- `apps/mobile/src/components/shell/PlusSheet.tsx` — two new entries:
  Corbeille (Trash), Exporter mes données.

## 3. Judgment calls, flagged rather than made silently

- **Worker Detail screen scope.** Doc 02 explicitly names "the Worker
  Detail screen" twice for Tier 0 surfacing, but no such screen — nor any
  dynamic-route convention — existed anywhere in mobile before this phase.
  Rather than building the full worker-management hub Doc 03 never
  actually specifies (edit worker, attendance history, advance history,
  documents — none of that is written down for mobile anywhere), I built
  exactly what Phase 5 needs: an identity header plus the Tier 0 lateness
  card. A fuller Worker Detail is future work, not invented here to look
  more finished than the spec asks for.
- **Trash screen vs. project deletion.** `projects.tsx` is **still an
  unbuilt empty-state stub** — confirmed by reading it before writing
  `trash.tsx`. Worker deletion is fully wired end-to-end this phase
  (`team.tsx`'s new delete action → `trash.tsx` → restore). Project
  deletion has no entry point anywhere in mobile, because the whole
  Projects screen was never built (a pre-existing Phase 1/3 gap, not
  something this phase's Trash screen was asked to fix). `trash.tsx`
  will correctly show and restore a soft-deleted project if one exists
  (e.g. deleted via web or Platform Admin) — it just can't be the thing
  that puts one there from mobile today.
- **Billing scope split.** `organizations.plan` is a bare `text` column,
  no subscription table, no Konnect (or any processor) integration
  anywhere — confirmed still true. What's honestly buildable from mobile
  alone: a read-only "your current plan" card, which is what shipped.
  What's NOT buildable here: an actual checkout flow — that needs API
  keys, a webhook-receiving Edge Function, and a real subscriptions table
  with a lifecycle, which is a backend integration decision, not a UI
  task. "Passer à Pro" is present (matching Doc 03 §3.21's screen shape)
  but intentionally inert with an honest in-app message rather than a
  fake checkout.
- **Reports/export naming check.** Confirmed against Doc 03 §3.20's
  actual wording before assuming anything: "Reports & exports" (curated
  PDF/Excel reports) and the roadmap's separate self-service data export
  are genuinely two different features, not a `budget_shared`-style
  naming collision.

## 4. Scope cuts, stated plainly

- **CSV only**, both for Reports and Data Export. Doc 03 §3.20 describes
  branded PDF (WhatsApp/print) and Excel; neither Edge Function has a
  PDF-rendering or `.xlsx`-writing library wired in. CSV opens fine in
  Excel/Sheets/Numbers and is genuinely usable — it's just not the
  polished branded document Doc 03 describes.
- **`payroll_summary` / `cnss_declaration` are basic aggregations**, not
  certified payroll or a filing-ready CNSS document. They give the
  underlying worker-days and amounts an accountant would need, not a
  regulator-ready submission.
- **No storage-usage bar on Billing.** Computing real usage against the
  1GB free-tier limit (Doc 01 §1.6) needs a recursive listing across
  every `org-files` subfolder — a feature of its own, not a quick
  addition to this screen.
- **Data export shares via `Share.share()`**, not a "save to device" flow
  — avoided adding `expo-file-system` + `expo-sharing` as two new native
  dependencies for what a share sheet already handles for text exports.
- **No date-picker library** — Reports' date range is two plain
  `YYYY-MM-DD` text fields, not a calendar UI.
- **The digest Edge Function's cron trigger isn't wired up** — this phase
  ships the function's logic; scheduling it (Supabase Dashboard → Edge
  Functions → Cron, or `supabase/config.toml`) is a deploy-time step
  outside this codebase.
- **Settings screen is still 95% unbuilt.** Only a single link to the new
  Notifications screen was added — profile, organization, security,
  language, team members, sign-out, and delete-account are all still the
  original stub, exactly as before this phase.

## 5. Manual test checklist

**DB / migration**

- [ ] Run the full migration sequence (0001→0025) against a clean local
      DB — confirms `0025` applies cleanly on top of the real `0024`.
- [ ] As a non-member, call `get_worker_lateness_pattern` /
      `get_digest_summary` for another org's worker/org id — both should
      return zero rows, not an error.
- [ ] Soft-delete a worker, confirm they disappear from `team.tsx`
      immediately (no refresh needed after the RPC call).
- [ ] Restore a worker from Trash within 30 days — succeeds. Try restoring
      a (manually backdated) worker past 30 days — `restore_worker`
      should no-op (its `deleted_at > now() - interval '30 days'` guard).
- [ ] As Org B, upload a photo attached to a `site_logs` row you're a
      Shared-layer participant on (Org A's project) — confirm you can now
      fetch the signed URL for that attachment where you couldn't before
      this phase's storage policy.

**Team / Trash**

- [ ] Tap a worker row → lands on Worker Detail, shows identity info.
- [ ] A worker with ≥4 dispatch assignments on the same weekday with a
      real lateness gap shows a lateness row; one with <4 shows the "not
      enough data" message instead.
- [ ] Delete a worker from `team.tsx`, confirm dialog appears, confirm →
      row disappears, appears in Trash with correct days-remaining count.
- [ ] Restore from Trash → worker reappears in `team.tsx`.

**Billing / Reports / Export**

- [ ] Billing shows the org's actual `plan` value; "Passer à Pro" shows
      the "coming soon" alert, does not attempt any payment action.
- [ ] Generate each of the 4 report types over a date range with known
      data — spot-check the CSV numbers against the source tables.
- [ ] As a non-owner/non-manager, attempt Data Export — blocked with the
      access-denied empty state; Edge Function itself also returns 403 if
      called directly with a viewer's token.
- [ ] Export as both CSV and JSON — confirm the share sheet opens with
      the expected content for each.

**Notifications**

- [ ] Toggle any category on for the first time → OS permission prompt
      appears; grant it → `profiles.expo_push_token` is populated.
- [ ] Deny the permission → in-app message shown, toggle still reflects
      the user's chosen state (not silently reverted).
- [ ] Set digest to "daily", manually invoke `send-digest-notifications`
      — confirm a `scheduled_job_runs` row is created and marked
      `success`, and (with a real Expo token) a push arrives when there's
      actually something pending; confirm NO push when there's nothing to
      report (empty digest is suppressed, not sent).

**General**

- [ ] `pnpm install && npx tsc --noEmit` clean across `apps/mobile`,
      `packages/shared-types`, `packages/validation` (verified in this
      delivery — re-run after merging to confirm nothing regressed).
- [ ] Web (`apps/web`) and Platform Admin (`apps/admin`) untouched — no
      files under either directory were modified.
