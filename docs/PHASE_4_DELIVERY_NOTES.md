# Phase 4 delivery — Multi-org collaboration (mobile)

## 0. Read this first — the documentation gap

Doc 01 (`01-data-model-security-and-architecture.md`) in what you gave me
stops at §1.13. Doc 02 cites §1.14–§1.19 repeatedly, including §1.17 for
cross-org rollup mechanics — the section Phase 4 leans on hardest. Those
sections are not in the file.

I did **not** invent prose to fill that gap. Instead:

- For schema questions (does a column already exist, what does an existing
  RLS predicate do), I read the actual migrations and code directly.
- For behavioral questions Doc 02 states plainly (invite flow, budget
  rollup default-off, "never blended" rollup output), I built against
  Doc 02's own wording.
- Where I found genuinely ambiguous territory Doc 01 §1.17 probably
  resolves and Doc 02 doesn't, I made a call and documented it as a
  judgment call in the code (see §4 below) rather than guessing at spec
  language and presenting it as fact.

One more thing I found in your uploads: an older, superseded 6-document
`.docx` set (00-index through 06-roadmap) — different from the 5-document
`.md` v4.0 set you're actively using. Its `05-multi-org-collaboration.docx`
has content that reads like an earlier draft of what Doc 01 §1.17 might
have said. I checked it against the actual schema before using anything
from it: its `project_memberships` shape (`status`, `organization_id`,
`budget_shared`, `trade_type`, `invited_by` columns) does **not** match
migration 0006's actual, simpler table. I used it only for directional
rationale (the three-layer visibility concept, phone-based dedup framing)
— nothing here was built against its schema.

## 1. Real bugs found and fixed (not part of the ask, fixed because I was

already in these files)

- **`supabase/functions/sign-up/index.ts`**: a stray leading `+` on a
  `console.error(...)` call (`+console.error(...)`) — a diff artifact left
  in the source. Harmless at runtime (unary `+` on a function call result,
  discarded) but clearly unintentional. Fixed while editing this function
  for the invite-passthrough addition.
- **Migration numbering**: `0019_admin_roles_and_sessions.sql` and
  `0020_announcements.sql` are byte-identical duplicates (only the header
  comment differs) of `0021_admin_roles_and_sessions.sql` and
  `0022_announcements.sql`. If migrations 19-22 are ever all applied in
  order, 21/22 will fail with "already exists" against what 19/20 already
  created. I did **not** delete or renumber anything here — that's a
  decision affecting the whole migration history, not something to make
  unilaterally inside a feature branch. Flagging for you to resolve
  (likely: delete `0019_admin_roles_and_sessions.sql` and
  `0020_announcements.sql`, keep `0021`/`0022`) before your next `db push`.

## 2. What's new

**Migration** `supabase/migrations/0024_project_invitations_and_shared_layer.sql`:

- `project_invitations` table + RLS (lead org's own outbox only).
- `invite_org_to_project(project_id, phone, email, trade_type, sent_via)` —
  security invoker, server-generates the token, upserts by (project,
  contact) on re-invite.
- `get_project_invitation_by_token(token)` — anon-safe, no
  account-existence leak (see its own comment for why it deliberately
  tells the caller nothing about whether an account already exists).
- `accept_project_invitation(token, budget_rollup_opt_in)` — security
  definer, existing-account path only. Scoped to the caller's own
  `active_org_id`, read from `auth.uid()` inside the function — never
  trusted from a parameter.
- `project_memberships.report_branding_opt_out` — new column.
- Additive Shared-layer SELECT policy on `site_logs`.

**No-account path**: `supabase/functions/sign-up/index.ts` now accepts
optional `org_invite_token` / `org_invite_budget_rollup_opt_in`. After the
new org is created, it resolves the pending invitation with the service
role and activates `project_memberships` directly — same reasoning as
`accept-worker-invitation` using service role instead of an RLS-gated RPC,
and non-fatal on failure (a failed invite-attach is logged, not worth
rolling back a successful sign-up over).

**Validation** (`packages/validation`):

- `collaboration.ts` — `inviteOrgToProjectSchema`,
  `acceptProjectInvitationSchema`, `acceptProjectInvitationViaSignUpSchema`,
  `updateProjectMembershipFlagsSchema`.
- `auth.ts` — `signUpSchema` gets two new optional fields
  (`org_invite_token`, `org_invite_budget_rollup_opt_in`). Additive; an
  ordinary sign-up with neither field is unaffected.

**Shared types** (`packages/shared-types`):

- `ProjectMembership.report_branding_opt_out: boolean`.
- New `ProjectInvitation` interface.
- New `OrgInvitationChannel` type (`'whatsapp' | 'sms' | 'email'` — no
  `'app'` option, unlike `InvitationChannel`: the invited org has no
  session/notification target to reach until it accepts).

**Mobile screens**:

- `(contractor)/collaboration.tsx` — full build (was the placeholder
  stub). Two sections: projects I lead (with member orgs, pending
  invites, an invite FAB+sheet) and projects I participate in as a trade
  (with my own budget-rollup / report-branding toggles).
- `accept-org-invite.tsx` — new. Resolves the token, then shows either an
  "Accepter" button (already logged in) or two choices ("J'ai déjà un
  compte" → login with a `next` redirect back here; "Créer un compte" →
  sign-up with trade_type/project/lead-org prefilled).
- `(contractor)/vue-ensemble.tsx` — new. One card per **owned** org (not
  every org the account belongs to), each with independently-fetched
  active-projects count, this-week advances total, tomorrow's dispatch
  status, and pending-request count. See file header for why the fetches
  stay separated per org instead of one combined query summed client-side.
- `(contractor)/dashboard.tsx` — org-switcher pill (Doc 05 §2.2) +
  `OrgSwitcherSheet`, with a "Vue d'ensemble" row shown only for accounts
  that own 2+ orgs. Rest of Doc 03 §3.9's home screen NOT built here — see
  §4.
- `sign-up.tsx` / `login.tsx` — extended, not rebuilt, to carry the
  optional invite token / `next` redirect through.

**Lib**:

- `lib/myOrgs.ts` — new. `listMyOrganizations()` /
  `listOwnedOrganizations()`.
- `lib/activeOrg.ts` — added `setActiveOrgId()`. Nothing in the repo wrote
  to `profiles.active_org_id` outside org creation before this; confirmed
  by grep before adding it.

**Components**:

- `components/shell/OrgSwitcherSheet.tsx` — new.
- `components/ui/illustrations.ts` — added `global-team` (Vue d'ensemble's
  single-owned-org edge case).

**Docs**:

- `docs/spec/05-design-system-and-ux-spec.md` — §1.4a (haptics table) and
  §1.5 (illustration table) both get new rows for this phase's additions.
- `docs/MOBILE_IMPLEMENTATION_STATUS.md` — created fresh; didn't exist
  anywhere in the uploaded repo. See its own header note.

## 3. Scope cuts, stated plainly

- **No project-detail screen was built.** `projects.tsx` is still a
  stub — no screen in the app has ever shown a single project's detail.
  "Wherever a multi-org project view exists today" resolves to nowhere;
  Collaboration is what's serving that role for Phase 4's purposes. It is
  NOT a general chantier-detail screen (no budget/schedule/task content).
- **Report branding renders nowhere on mobile.** The opt-out flag exists
  and is toggleable from Collaboration, but actual report/PDF generation
  is a web export concern — same boundary as Phase 3's PDF-export cut.
- **Vue d'ensemble lives behind the org-switcher sheet on Dashboard, as a
  new route** (`/vue-ensemble`), not a Dashboard mode and not something
  reachable from Settings. Settings isn't a built screen yet either.
  Dashboard's data shape is single-org throughout Phase 1-3; Vue
  d'ensemble's is N independent per-org fetches composed side by side —
  different enough to warrant its own route. This is a judgment call, not
  something Doc 02 states — flagged in `OrgSwitcherSheet.tsx`'s own
  comment, same as material-request's nav entry point in Phase 3.
- **Dashboard itself is still mostly a stub.** Only the org-switcher pill
  was added — the rest of Doc 03 §3.9 (hero card, dispatch summary,
  activity feed) is separate, larger work outside Phase 4's brief.
  Building it wasn't requested and wasn't attempted.
- **Invite delivery (actually sending the WhatsApp/SMS/email) isn't
  built.** The `project_invitations` row and its token exist and are
  everything `accept-org-invite.tsx` needs; dispatching the message that
  carries the link is a notification concern, same division of labor as
  Phase 1's `invite_worker`.
- **Storage-bucket gap left open, not silently shipped as if fixed**: see
  migration 0024's file header and `MOBILE_IMPLEMENTATION_STATUS.md`.
  Cross-org project members can now read a shared `site_logs` row but not
  its attached photo/voice file.

## 4. Judgment calls made explicit

- **`budget_rollup_opt_in` vs. `budget_shared`**: Doc 02 calls the flag
  `budget_shared`; the actual column (migration 0006) is
  `budget_rollup_opt_in`, and `shared-types` already used that name. Read
  both before deciding — same field, reused, no duplicate column added.
- **Vue d'ensemble entry point**: new route off the org-switcher sheet
  (see §3 above and the code comment in `OrgSwitcherSheet.tsx`).
- **Shared-layer RLS scope**: `site_logs` only, not materials/safety/
  insurance — Doc 02's own Shared-layer examples don't map to any table
  that exists.
- **"Owns" for Vue d'ensemble**: `organization_members.role = 'owner'`,
  not `organizations.created_by` — confirmed by reading `0003_organizations
.sql`: there's no separate `owner_id` column, and `created_by` records
  who created the org, a different, immutable fact from current ownership.

## 5. Manual test checklist

**Migration**

- [ ] `0024` applies cleanly on top of `0023` in a fresh local DB.
- [ ] Resolve the `0019`/`0020` duplicate-migration issue (see §1) before
      running this against an environment that already has `0021`/`0022`
      applied but not `0019`/`0020` — order matters here.

**Invite send (lead org)**

- [ ] As an owner/manager of a lead org with at least one project, open
      Collaboration → FAB → invite by phone, by email, and by both.
- [ ] Re-inviting the same contact on the same project updates the
      existing pending row (check `project_invitations`, should not
      duplicate).
- [ ] As a viewer-role or non-member of the lead org, confirm
      `invite_org_to_project` raises `insufficient_permissions`.

**Accept — existing account**

- [ ] Log in as an org owner in a second account, open
      `dala://accept-org-invite?token=...` while logged in → "Accepter"
      works, `project_memberships` row appears with `role='trade'` and
      the chosen `budget_rollup_opt_in`.
- [ ] Same link while logged OUT, choose "J'ai déjà un compte" → log in →
      lands back on accept-org-invite and completes acceptance.
- [ ] Expired token → expired state. Already-accepted token → that state.
      Garbage token → not-found state.

**Accept — no account yet**

- [ ] Same link, logged out, "Créer un compte" → sign-up screen shows the
      trade_type/project/lead-org banner, trade_type pre-filled.
- [ ] Complete sign-up + email confirmation → log in → the new org already
      has the `project_memberships` row for the invited project (check
      directly in the DB — no UI confirms this today, only Collaboration
      would surface it if you're a member of that org).
- [ ] Re-run the same flow with an already-accepted or expired token —
      confirm `sign-up` logs the skip and still completes account
      creation (account creation must not fail because of a stale invite).

**Budget rollup / report branding**

- [ ] As a trade org on a shared project, toggle both switches in
      Collaboration; confirm both persist after navigating away and back.
- [ ] As the lead org, confirm the member row shows "Budget partagé" only
      when that trade org's `budget_rollup_opt_in` is true, never an
      itemized figure.

**Vue d'ensemble**

- [ ] Account that owns 1 org: org-switcher pill only shows if the account
      belongs to 2+ orgs total; "Vue d'ensemble" row never shows.
- [ ] Account that owns 2+ orgs: "Vue d'ensemble" row appears, each card's
      four figures load independently and correctly per org (spot-check
      against each org's own dispatch/advances/materials screens).

**Shared-layer site_logs**

- [ ] As a trade org invited onto another org's project, confirm you can
      now read that project's site_logs entries written by the lead org
      (or another trade org) — and confirm the attached photo/voice still
      403s (expected, documented gap, not a regression).

**Regression**

- [ ] `tsc --noEmit` clean across `apps/mobile`, `packages/validation`,
      `packages/shared-types` (all three run clean as of this delivery).
- [ ] Existing Phase 1-3 flows (worker invite/accept, dispatch, advances,
      materials, site logs single-org) untouched and still working — no
      Phase 4 change removes or narrows any existing RLS policy, only
      adds new ones or new columns.
