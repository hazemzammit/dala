-- =============================================================================
-- 0112_fix_dispatch_project_org_scoping.sql
-- Ref: docs/audits/DALA_FULL_SYSTEM_AUDIT.md §Multi-Tenancy (MT-2), §Phase 1
--      docs/spec/01-data-model-security-and-architecture.md §1.5
--      docs/ARCHITECTURE.md "The one authorization pattern"
--      supabase/migrations/0034, 0035, 0038, 0098
--
-- MEDIUM FIX (multi-tenancy) — the third instance of "the policy checked the
-- USER, not the ROW" in this codebase, after 0039 (predicate recursion) and
-- 0093 (NULL-bypass). MT-2 was left open by the audit with one instruction:
-- trace every INSERT/UPDATE policy on dispatch_assignments / project_workers /
-- project_memberships and ask, of each, "does this check that the SPECIFIC
-- project belongs to the org ON THE ROW, or only that the caller belongs to
-- SOME org with a role?". Answered here, in full, against a live database.
--
-- WHAT WAS ACTUALLY WRONG (reproduced, not reasoned from source)
--
-- is_project_participant(target_project) (0034) answers a question about the
-- CALLER, not about a row:
--
--   is_org_member((select lead_org_id from projects where id = target_project))
--     or is_project_member(target_project)
--
-- Both branches are satisfied when the CURRENT USER is associated with that
-- project through ANY org they belong to. The write policies then ask that
-- caller-scoped question about `project_id`, and a row-scoped question
-- (`org_role_of(org_id) in ('owner','manager')`) about `org_id` — two
-- different orgs, never required to be the same one. Multi-org membership is
-- a supported, documented feature (Doc 00 §0.5 #21: "one account can create
-- and own multiple organizations"), so those two columns can legitimately
-- disagree, and 0035/0038's check cannot tell the difference.
--
-- Reproduced against the local stack as a user who is a MANAGER of Org A and a
-- plain member of Org B. With the 0035/0038 policies in force, all three of
-- these were accepted (now pinned as regression cases in
-- supabase/tests/security_regression.sql, the "0112 …" cases):
--
--   1. insert into dispatch_assignments(org_id => A, project_id => <B's project>,
--                                       worker_id => <A's worker>);        -- accepted
--   2. insert into project_workers(project_id => <B's project>,
--                                   worker_id  => <A's worker>);            -- accepted
--   3. update dispatch_assignments set project_id = <B's project>
--      where id = <A's existing assignment>;                                 -- accepted
--
-- (1) additionally auto-seeded a project_workers row through
-- seed_project_worker_from_dispatch (0034), whose guard was the same
-- caller-scoped predicate — so org A's crew landed on org B's roster.
--
-- Stated precisely, because the severity depends on it: this is a REFERENTIAL
-- hole, not a disclosure one. No org can read another org's rows (both tables'
-- SELECT policies are is_org_member(org_id) and are untouched here) and no org
-- can write into another org's rows. What org A could do was attach its own
-- operational rows to a project it has no relationship with, without the lead
-- org's involvement — which is exactly the guarantee Doc 02 §2.8's
-- org-to-org collaboration model rests on. 0078 had already noticed the shape
-- of the gap in its own header ("is_project_participant() … is scoped to the
-- CALLING user's own org and isn't parameterized by an arbitrary target org,
-- so it isn't reusable here as-is"); this migration is that parameterized
-- version, made reusable.
--
-- WHAT THIS DOES *NOT* CHANGE, deliberately, each with the reason stated here
-- rather than left for the next reader to reverse-engineer:
--
--   - project_memberships' own write policy (0006) is untouched. It requires
--     owner/manager of the project's LEAD org, so no org can add itself to
--     somebody else's project; what the lead org can do is add a membership
--     row without going through invite/accept (0024). That is a product
--     question about the invitation flow, not this bug class, and changing it
--     would alter behavior the app may rely on.
--   - `project_id is null` (maintenance/unassigned dispatch) stays
--     unconditionally writable, exactly as 0035 established. "Sans vehicule"
--     dispatch with no project is a real, existing use case.
--   - project_workers' DELETE policy keeps the old caller-scoped check. It
--     only ever matches the caller's OWN rows (both org_role_of and
--     is_project_participant are evaluated against the caller's own orgs), so
--     it cannot be used to reach another org's data, and leaving it alone
--     preserves 0035's "an org that lost project access can still clean up
--     after itself" property.
--   - dispatch_assignments' UPDATE USING side (the old row) stays role-only,
--     for that same 0035 reason: an org removed from a project must still be
--     able to confirm/complete its own existing assignments. Only the WITH
--     CHECK side — which governs where a row may now POINT — is tightened.
--   - The `client` project_memberships role counts as participation, the same
--     as 0034's is_project_participant did. This migration fixes the ORG
--     dimension of that predicate, not its role dimension; narrowing it
--     further would be a product decision about the client portal.
--   - site_logs / materials / project_expenses also carry a project_id whose
--     org relationship is not checked at all (0008's site_logs insert policy is
--     is_org_member(org_id), full stop). That is a wider gap across a
--     different set of tables than the audit scoped MT-2 to; recorded here
--     rather than silently widened into this migration.
--
-- DATA CHECK, run before writing this (read-only, local stack):
--
--   select count(*) from project_workers pw
--    where not exists (select 1 from workers w
--                       where w.id = pw.worker_id and w.org_id = pw.org_id);
--   -> 0  (4 rows total)
--
--   -- rows the policies in force would no longer accept:
--   select count(*) from dispatch_assignments da where da.project_id is not null
--     and not exists (select 1 from projects p where p.id = da.project_id and p.lead_org_id = da.org_id)
--     and not exists (select 1 from project_memberships pm where pm.project_id = da.project_id and pm.org_id = da.org_id);
--   select count(*) from project_workers pw
--     where not exists (select 1 from projects p where p.id = pw.project_id and p.lead_org_id = pw.org_id)
--     and not exists (select 1 from project_memberships pm where pm.project_id = pw.project_id and pm.org_id = pw.org_id);
--   -> 0 / 0
--
-- So no local data needs remediation. Production was NOT checked from here —
-- re-run both queries there before VALIDATE-ing the constraint at the end.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- The one new predicate: the same "is this org on the project" question 0034
-- already asked, but parameterized by the org instead of by the caller, and
-- scoped to an org the caller actually belongs to — so it cannot be used as an
-- "is org X a member of project Y" oracle for arbitrary pairs, and so it
-- always returns false for an anon / session-less write, which is exactly how
-- is_project_participant already behaves for those (that is why the auto-seed
-- trigger's behavior for a service-role insert does not change below).
--
-- SECURITY DEFINER + set search_path = public, per 0039's established
-- convention: the internal lookups against projects/project_memberships must
-- not be re-gated by those tables' own RLS, whose policies call
-- is_org_member/is_project_member in turn. It answers only about the pair of
-- ids it is given, and only after is_org_member() has confirmed the caller
-- belongs to that org — the same safety argument 0039 states for
-- is_org_member/is_project_member themselves.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_project_participant(target_project uuid, target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_project is not null
    and target_org is not null
    and public.is_org_member(target_org)
    and (
      exists (select 1 from projects p where p.id = target_project and p.lead_org_id = target_org)
      or exists (select 1 from project_memberships pm
                  where pm.project_id = target_project and pm.org_id = target_org)
    );
$$;

comment on function public.is_org_project_participant(uuid, uuid) is
  'RLS predicate: is THIS ORG (the one on the row) associated with this project — as the lead org or as a trade/client participant? Use this, not is_project_participant(uuid), in any policy that decides permission from a row''s own org_id: is_project_participant() is scoped to the CALLING user''s org(s) and one user may belong to several, so on its own it lets a manager of org A satisfy the project check through a membership in org B. Fails closed (false) for a null/unknown project or org.';

revoke execute on function public.is_org_project_participant(uuid, uuid) from public, anon;
grant execute on function public.is_org_project_participant(uuid, uuid) to authenticated, service_role;
-- anon is granted deliberately, for the reason 0100 documents for the other
-- pure RLS predicates ("kept so anonymous queries keep returning 'no rows'
-- instead of erroring"): for anon auth.uid() is NULL, so the is_org_member()
-- call inside is always false and the function can only ever return false.
-- 0100's allowlist is a snapshot of that migration's own sweep; the live list
-- is supabase/tests/lint_anon_execute_allowlist.sql, which this is added to.
grant execute on function public.is_org_project_participant(uuid, uuid) to anon;


-- ---------------------------------------------------------------------------
-- dispatch_assignments — 0035/0038's policies with the participant check
-- re-pointed at the row's own org. Bodies otherwise unchanged (same project_id
-- IS NULL escape, same is_project_active freeze, same USING side).
-- coalesce(org_role_of(...), 'none') is the repo-wide shape for a role check
-- (docs/ARCHITECTURE.md "The one authorization pattern"); 0035/0038 wrote the
-- bare `in (...)` form, which already fails closed for a NULL role because
-- RLS treats NULL as "does not pass", so that part is consistency only.
-- ---------------------------------------------------------------------------
drop policy if exists dispatch_assignments_insert_owner_manager on public.dispatch_assignments;
drop policy if exists dispatch_assignments_update_owner_manager on public.dispatch_assignments;

create policy dispatch_assignments_insert_owner_manager on public.dispatch_assignments
  for insert
  with check (
    coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
    and (
      project_id is null
      or (
        public.is_org_project_participant(project_id, org_id)
        and public.is_project_active(project_id)
      )
    )
  );

create policy dispatch_assignments_update_owner_manager on public.dispatch_assignments
  for update
  using (coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager'))
  with check (
    coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
    and (
      project_id is null
      or (
        public.is_org_project_participant(project_id, org_id)
        and public.is_project_active(project_id)
      )
    )
  );

-- dispatch_assignments_delete_owner_manager (0035) and the two worker-facing
-- SELECT/UPDATE policies (is_own_worker) are untouched.

-- ---------------------------------------------------------------------------
-- project_workers — 0038's insert/update policies, same substitution. The
-- USING side is tightened too: 0038 already gated "which rows may this org
-- change" on participation, it just asked the question about the caller rather
-- than about the row, which is the same bug in the same place. The DELETE
-- policy is left exactly as 0038 wrote it, for the reason in the header.
-- ---------------------------------------------------------------------------
drop policy if exists project_workers_insert_owner_manager on public.project_workers;
drop policy if exists project_workers_update_owner_manager on public.project_workers;

create policy project_workers_insert_owner_manager on public.project_workers
  for insert
  with check (
    coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
    and public.is_org_project_participant(project_id, org_id)
    and public.is_project_active(project_id)
  );

create policy project_workers_update_owner_manager on public.project_workers
  for update
  using (
    coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
    and public.is_org_project_participant(project_id, org_id)
  )
  with check (
    coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
    and public.is_org_project_participant(project_id, org_id)
    and public.is_project_active(project_id)
  );


-- ---------------------------------------------------------------------------
-- seed_project_worker_from_dispatch (0034) — body reproduced in FULL, as
-- Postgres requires. One line changes: the guard now asks about the assignment's
-- own org instead of the calling user's, so an assignment that somehow reached
-- this trigger without a legitimate project association seeds nothing.
--
-- This is defense in depth, not the fix itself: 0034's own header already
-- called it that, and the RLS policies above now reject such an assignment
-- before the trigger can run. It still has to be correct on its own because it
-- is SECURITY DEFINER and therefore not covered by those policies.
--
-- CREATE OR REPLACE keeps the function's existing owner and privileges, so the
-- `revoke execute ... from public, anon, authenticated` that 0034 applied to
-- this trigger-only function still stands and is not repeated here (0100 skips
-- trigger functions for the same reason). The COMMENT is repeated because the
-- guard it describes has changed.
-- ---------------------------------------------------------------------------
create or replace function public.seed_project_worker_from_dispatch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null
     and public.is_org_project_participant(new.project_id, new.org_id) then
    insert into project_workers (project_id, worker_id, org_id, added_by)
    values (new.project_id, new.worker_id, new.org_id, auth.uid())
    on conflict (project_id, worker_id) where removed_at is null
    do update set removed_at = null, removed_by = null;
  end if;
  return new;
end;
$$;

comment on function public.seed_project_worker_from_dispatch() is
  'Auto-adds/reactivates a project_workers row when a dispatch assignment carries a project_id, only if the ASSIGNING ORG is an actual participant of that project (lead or trade/client) — is_org_project_participant(project_id, org_id), which since 0112 asks about the row''s org rather than about whichever org the caller happens to also belong to. Trigger-only — see 0034''s header for why it is revoked from every role.';

-- ---------------------------------------------------------------------------
-- Composite FK: project_workers.org_id is denormalized from workers.org_id and
-- 0034's BEFORE INSERT trigger derives it from worker_id — but only on INSERT.
-- Nothing stopped a later UPDATE from re-pointing worker_id at another org's
-- worker while keeping this row's org_id, which would then misrepresent who is
-- rostered where (and, with the org-scoped policies above, hand a row to an org
-- that has nothing to do with the project). workers(id, org_id) is unique since
-- 0098. Same NOT VALID convention as 0098's attendance/dispatch FKs: enforced
-- for every new or changed row, legacy rows not re-checked.
--
-- Consequence worth stating: this (like 0098's) also makes a future UPDATE of
-- workers.org_id fail while such rows exist. No code path in this app moves a
-- worker between orgs — checked, not assumed — so nothing is blocked today.
-- ---------------------------------------------------------------------------
alter table public.project_workers
  add constraint project_workers_worker_org_fk
  foreign key (worker_id, org_id) references public.workers (id, org_id) not valid;

-- Follow-up, NOT done here: `alter table public.project_workers validate
-- constraint project_workers_worker_org_fk;` once the diagnostic at the top of
-- this migration has been run against production and returned 0 rows (the local
-- stack already reports 0 of 4). Deliberately left to a separate migration, the
-- same way 0111 was, rather than shipping a VALIDATE that has only ever been
-- checked against dev data.
-- =============================================================================

