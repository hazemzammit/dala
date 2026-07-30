# Dala Admin — next-phase implementation (priorities 2, 3, 4 from the handoff prompt)

## Environment disclosure (unchanged from last session, still true)

No Docker, no Supabase CLI in this sandbox — Node/pnpm only. Priority #1
from the handoff prompt ("get the four real-environment commands
actually run") is **still not done** here for the same reason as every
prior session: nothing to run them against. `tsc --noEmit` and
`next build` were run for real, twice (once mid-build after a sandbox
reset), both clean.

## What was built this session

### 1. Scheduled-announcement firing (priority #2 — closed)

New migration `0031_scheduled_announcement_firing.sql`:
`publish_due_scheduled_announcements()`, a pure-SQL function (no Edge
Function, no Vault secret needed — it never leaves Postgres) that flips
`published_at` when `scheduled_for` is due. Scheduled via `pg_cron` every
minute. Once `published_at` is set, the existing
`send-announcement-notifications` job (0030) picks the row up on its
next 5-minute tick exactly the way it already does for immediate
publishes — no changes needed there beyond updated comments.

This was the one concrete remaining gap in Announcements after last
session (authoring + push delivery + in-app-banner read contract were
all already real); it's now closed. Email delivery is still not built —
unchanged, still disclosed.

### 2. Services Health infra grid (priority #3 — built, partially, disclosed)

New migration `0032_service_health_checks.sql` + new Edge Function
`ping-service-health` (cron every 5 min, reuses the same two Vault
secrets as 0026/0027/0030 — no new secret registered):

- **Supabase Auth** — real check via `admin.auth.admin.listUsers()`.
- **Supabase Storage** — real check via `admin.storage.listBuckets()`.
- **Resend** — real check via `GET https://api.resend.com/domains` with
  the existing `RESEND_API_KEY`.
- **Expo Push** — real reachability check (POST an empty array to
  `https://exp.host/--/api/v2/push/send`; Expo has no dedicated
  health-check endpoint, so any HTTP response — including a non-2xx — is
  treated as "up"; only a network-level failure counts as "down").
- **Konnect — deliberately NOT checked.** Billing/payments integration
  doesn't exist anywhere in this repo yet (Billing is still the minimal
  stub), so there's no real Konnect API call anywhere to base a
  reachability check on. Inventing an endpoint/auth shape to ping would
  risk pinging the wrong thing and reporting a false "down" — worse than
  showing it plainly as unmonitored, which is what the UI does.

New component `InfraStatusGrid.tsx`, wired into the Services Health page
alongside the existing scheduled-job table.

**Real bug fixed as part of this:** the existing `MONITORED_JOBS` list in
`services-health/route.ts` named five job names
(`expire_invitations`, `send_payment_reminders`, `weekly_salary_summaries`,
`cleanup_orphaned_files`, `realtime_edge_function_usage_budget_check`)
that don't match any `job_name` any real Edge Function in this repo
actually inserts — a stale placeholder list silently monitoring nothing,
while the three real cron-invoked jobs (`send_impersonation_notifications`,
`send_digest_notifications`, `send_announcement_notifications`) weren't
in it at all. Fixed to the real three.

### 3. shared-types consolidation (priority #4 — done)

Added `Announcement`, `ScheduledJobRun`, and `OrgStorageUsage` to
`packages/shared-types/src/index.ts` for real this time (a prior
session's notes claimed these three already existed there; a fresh read
last session found they didn't). Rebased onto the current file — nothing
mobile/web has added was touched or removed.

Beyond just adding them: the three admin call-sites that previously
defined equivalent types locally/inline (`AnnouncementsList.tsx`,
`ScheduledJobsTable.tsx`, `StorageUsageTable.tsx` + the storage route)
now import from `@dala/shared-types` instead of duplicating — closing
the actual drift, not just adding a third copy of the same shape.

Real value beyond tidiness: apps/web/apps/mobile can now import
`Announcement` if either builds a screen against
`get_active_in_app_announcements()` (0030), without redefining the shape
themselves.

## Verification run for real, this sandbox

| Command                                                                                 | Result                                                                                                     |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm install` (root)                                                                   | ✅ Real — ran twice (sandbox state reset once between messages), clean both times                          |
| `tsc --noEmit` (`apps/admin`)                                                           | ✅ Real — **0 errors**, after all edits including the shared-types import changes                          |
| `next build` (`apps/admin`)                                                             | ✅ Real — **36/36 routes build clean**                                                                     |
| `supabase db reset` / `pnpm test` / `generate-totp-vault-key` / `register-cron-secrets` | ⚠️ Still not run — no Docker/Supabase CLI here. This remains the top real gap across every session so far. |

## Manual verification checklist for you

1. `pnpm install` at repo root.
2. `supabase start && supabase db reset` — confirm clean through `0032`.
3. Schedule a test announcement 2 minutes out; confirm `published_at`
   gets set within a minute of `scheduled_for`, and `delivered_at`
   follows within the next 5-minute tick.
4. Watch `service_health_checks` fill in over ~10 minutes; confirm all
   four rows (`supabase_auth`, `supabase_storage`, `resend`,
   `expo_push`) get real `up` statuses (or a real, informative
   `error_message` if something's actually misconfigured — e.g. a bad
   `RESEND_API_KEY`).
5. Open Services Health — confirm the infra grid shows real statuses and
   the scheduled-job table now lists the three real jobs, not the old
   placeholder five.
6. `cd apps/admin && pnpm test` — this is still the single most
   important thing left undone across every session; if you have a real
   environment now, please actually run it and report what happens.
