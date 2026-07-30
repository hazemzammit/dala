# Phase 7 delivery guide — Dala (Chantier OS) mobile

Scope agreed at the start of this phase: close the Doc 01 §1.14–§1.19
documentation gap, build `(contractor)/settings.tsx` and `projects.tsx` for
real, add targeted tests for what changed — and explicitly push 2FA and the
full Doc 02 §2.11 test-matrix buildout to their own next phase.

This zip contains **only new/changed files**, repo-relative paths preserved.
No files were deleted. Full context for every decision below (including the
investigation that preceded any of this) is in the conversation itself and
in `docs/MOBILE_IMPLEMENTATION_STATUS.md`'s new Phase 7 section — this guide
is the condensed version.

---

## What's new

### Documentation

- **`docs/spec/01-data-model-security-and-architecture.md`** — §1.14 through
  §1.19 added, closing a gap that had been open (and cited by Doc 02/03)
  since Phase 4/5. Each section is written from what's actually built, not
  invented to fill a number — §1.15 (2FA) is the one exception worth reading
  directly: it documents a real finding (optional per-account 2FA was never
  built, only Platform Admin's separate mandatory TOTP exists) rather than
  describing a working feature.
- **`docs/spec/05-design-system-and-ux-spec.md`** — haptics table (§1.4a)
  extended with six new rows for this phase's new save/confirm moments.
- **`docs/MOBILE_IMPLEMENTATION_STATUS.md`** — new "Phase 7" section.

### Database (`supabase/migrations/0028_...sql`)

- `projects.start_date` / `projects.project_type` columns (+ check
  constraint enum).
- `phone_change_requests` table + `request_phone_change()` /
  `confirm_phone_change()` RPCs.
- `update_organization_member_role()` / `remove_organization_member()` RPCs
  (owner-only, protect the last remaining owner).
- `update_organization_profile()` RPC (column-level owner-only enforcement
  for `matricule_fiscal`/`rc_number`).
- `profiles.deletion_requested_at` column + `request_account_deletion()`
  RPC.

**Run this migration before deploying the mobile changes** — the new
screens call these RPCs directly.

**One manual step this migration needs from you, same shape as the digest
cron in Phase 6**: `request_phone_change()` calls `net.http_post` against a
`sms_provider_webhook_url` Vault secret that doesn't exist yet in this
project. Without it, phone-change requests will fail loudly (a clear
Postgres error, not a silently-never-arriving SMS) until you either (a) add
that secret pointing at a real SMS provider webhook, or (b) treat phone
change as not-yet-usable in production and hide/disable that row in
`profile-settings.tsx` for now. Email change and everything else in this
phase has no such dependency.

### New Edge Function

- **`supabase/functions/delete-account/`** — deploy this alongside the
  migration. Needs `SUPABASE_SERVICE_ROLE_KEY` in its environment (standard
  for this repo's other service-role functions).

### Packages

- **`packages/shared-types`** — `ProjectType`, `Project.start_date`/
  `project_type`, `Profile.deletion_requested_at`.
- **`packages/validation`** — `createProjectSchema` extended;
  `requestEmailChangeSchema`, `updateOrganizationMemberRoleSchema`,
  `deleteAccountConfirmSchema`, `changePasswordSchema` added. **Two
  pre-existing bugs fixed**: `logo_url`/`avatar_url` were validated as
  `.url()` but are actually storage _paths_ per `lib/storage.ts`'s own
  convention — neither field had a real caller before this phase, so this
  never surfaced until now.
- **`packages/validation/src/projects.test.ts`**,
  **`organizations.test.ts`** — 21 tests total, all passing (verified in an
  isolated sandbox during this session — see checklist below to re-verify
  in your own environment).

### Mobile screens (`apps/mobile/src/app/(contractor)/`)

- `settings.tsx` — full rebuild (Doc 03 §3.22 row list).
- `profile-settings.tsx`, `organization-settings.tsx`,
  `security-settings.tsx`, `team-members.tsx`, `delete-account.tsx` — new.
- `projects.tsx` — full rebuild (Doc 03 §3.10.1 + §3.10.3).
- `lib/photoPipeline.ts` — `processAvatarPhoto()`/`processLogoPhoto()`
  added.

---

## Real scope cuts, stated plainly (not silent gaps)

1. **2FA** — not built. Confirmed dropped, not deferred (see Doc 01 §1.15).
   Scoped as its own next phase per your instruction.
2. **Doc 02 §2.11 full test matrix** — not built. `detox` sits unused in
   `apps/mobile/package.json`; this phase added targeted `vitest` unit tests
   for its own new schemas only, not the Jest/Detox/RLS-matrix buildout the
   spec actually describes. Also its own next phase per your instruction.
3. **"Membres de l'équipe" invite-by-email** — not built. The screen
   manages existing `organization_members` (role change, removal); adding
   people who aren't already members needs a new invitation pipeline
   parallel to `worker_invitations` that doesn't exist yet.
4. **Project detail as a full tab-bar hub (Doc 03 §3.10.2)** — not built.
   Tapping a project opens a lightweight sheet with plain links to the five
   existing standalone screens (none of which accept a project-id param
   today), not the nested-tabs hub the spec describes.
5. **Progress % / progress ring** — not shown anywhere. No milestones/tasks
   data model exists to compute it from; only budget-consumed (real,
   computable) is shown on project cards.
6. **Date picker for "Date de début"** — a validated text field
   (`AAAA-MM-JJ`), not a native calendar widget. No date-picker dependency
   existed anywhere in this repo before this phase; adding one is a
   native-linking change out of proportion for one field.
7. **Avatar/logo crop** — center-crop + resize, not an interactive
   drag-to-reposition crop tool.

## What I could and couldn't verify myself

- Ran `packages/validation`'s 21 new tests in an isolated sandbox — all
  pass. I could not run them inside the actual monorepo workspace (the
  `workspace:*` protocol in `package.json` isn't resolvable by plain `npm
install` without the full pnpm workspace) — re-run `pnpm test --filter
@dala/validation` in your own environment to confirm inside the real
  workspace.
- Syntax-checked every new/changed `.tsx`/`.ts` file with `esbuild` (catches
  real syntax errors) — all clean. I could not run a full `tsc --noEmit`
  against the real monorepo (would require installing the entire
  dependency tree, impractical in this session) or actually launch the app
  — you'll want to do both before merging.
- Could not test the new SQL migration against a real Postgres instance —
  checked for balanced `$$...$$` blocks and parens by hand; run it against
  a dev Supabase project first, as always.

---

## Manual test checklist

**Migration**

- [ ] `0028` applies cleanly against a fresh copy of your dev DB.
- [ ] `sms_provider_webhook_url` Vault secret: either add it, or confirm
      phone-change intentionally errors without it.

**Projects**

- [ ] Create a project with all fields — appears in the list, budget-consumed
      bar shows once an expense exists.
- [ ] Edit a project — optimistic-concurrency conflict (edit the same
      project from two sessions) surfaces the "modified elsewhere" message,
      not a silent overwrite.
- [ ] Delete a project — confirm it appears in Trash and is restorable.
- [ ] Filter chips (Tous/Actifs/Terminés/Invités) and search all narrow the
      list correctly.
- [ ] A project this org is only a trade participant on (not lead) shows the
      lead org's name badge and appears under "Invités."
- [ ] A `viewer`-role account sees no FAB and no edit/delete actions.

**Settings**

- [ ] Profile: avatar upload round-trips (upload → signed URL displays);
      name save; phone-change request/confirm (once the SMS secret exists,
      or confirm the expected loud failure without it); email change sends
      Supabase's native double-confirmation.
- [ ] Organization: logo upload; name/address/contact edits save for a
      manager; matricule_fiscal/rc_number are visibly locked for a manager
      and editable for an owner; a manager attempting those two via a raw
      API call is still rejected server-side.
- [ ] Security: password change requires the correct current password;
      wrong current password is rejected before any change happens.
- [ ] Team members: owner can change another member's role and remove a
      member; blocked from demoting/removing the org's last remaining
      owner (including themselves).
- [ ] Delete account: wrong confirmation text is rejected; correct text
      triggers deletion and signs the user out; a sole org owner is blocked
      with a clear message.

**Regression**

- [ ] `trash.tsx` still lists and restores both workers and the
      newly-deletable projects correctly.
- [ ] `expenses.tsx`/`materials.tsx`/`journal.tsx`/`safety.tsx`/
      `dispatch.tsx` are unaffected (still standalone, own project picker).
