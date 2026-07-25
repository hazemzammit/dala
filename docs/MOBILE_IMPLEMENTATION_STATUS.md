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
- Migration numbering: `0019_admin_roles_and_sessions.sql` and
  `0020_announcements.sql` are stale duplicates of `0021`/`0022` of the
  same names — found while reading all migrations for this phase,
  flagged for cleanup, not touched by this migration.
