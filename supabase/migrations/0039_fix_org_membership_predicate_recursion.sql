-- =============================================================================
-- 0039_fix_org_membership_predicate_recursion.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5
--
-- CRITICAL FIX — found by actually running `pnpm --filter mobile test:rls`
-- against a real local Supabase instance for the first time (Phase 16,
-- ~15 phases after 0005 first shipped this pattern and ~7 phases after the
-- integration suite that would have caught it was first written). Every
-- test in the suite that exercised a real RLS-enforced query — advances,
-- attendance_records, projects (rollup), soft_delete_project — failed with
-- Postgres error 54001 "stack depth limit exceeded", not a business-logic
-- assertion failure.
--
-- ROOT CAUSE: `is_org_member()` and `org_role_of()` (0005) are declared
-- plain `language sql stable`, not `security definer`. Both query
-- `organization_members` directly:
--
--   select exists (
--     select 1 from organization_members
--     where org_id = target_org and user_id = auth.uid()
--   );
--
-- `organization_members` itself has RLS enabled, with its own SELECT
-- policy — `organization_members_select_fellow_member` — defined as
-- `using (is_org_member(org_id))`. Because the predicate functions are NOT
-- security definer, that inner SELECT inside `is_org_member()` is ITSELF
-- subject to `organization_members`'s own RLS policy, which calls
-- `is_org_member()` again to decide whether the row is visible — which
-- performs the same SELECT again — which triggers the same policy again.
-- Unbounded recursion, every single time either function is called from
-- ANY RLS policy on ANY table (which per 0005's own header is "THE single
-- authorization pattern for this entire product" — meaning this bug is
-- load-bearing everywhere, not confined to one feature).
--
-- This has been present, unchanged, since 0005 (the very first migration
-- to define these functions) — every phase since has been reasoning about
-- RLS correctness from migration source only, never from a live query,
-- because the integration suite that would have surfaced this couldn't
-- run at all until this same phase's earlier `transformIgnorePatterns` fix
-- unblocked it. Given the "Phase 1 check-in flow had never actually
-- worked against real RLS" precedent (Doc 00 history), this is the same
-- class of finding at a larger scale: something structurally central,
-- confidently reasoned about for many phases, never actually exercised.
--
-- FIX: mark both `security definer`, so the internal lookup against
-- `organization_members` bypasses that table's own RLS instead of
-- re-triggering it. This is safe — not a privilege-escalation risk —
-- because the query itself already scopes to `user_id = auth.uid()` in
-- its own WHERE clause; RLS on `organization_members` was never the
-- mechanism providing that scoping, so bypassing it here doesn't expose
-- any row the caller shouldn't already be allowed to know about (their
-- own membership row, for the org id they themselves passed in). Same
-- reasoning already established for every other security-definer RPC in
-- this repo (0018's invite_worker, 0025's get_worker_lateness_pattern /
-- get_digest_summary) — security definer explicitly to let an
-- is_org_member()-shaped check evaluate at all, still fully gated by that
-- same check inside the function body.
--
-- `set search_path = public` on both, per this repo's own established
-- security-definer convention (0025), to prevent search_path-hijacking of
-- an elevated-privilege function. Explicit grants to both `anon` and
-- `authenticated` — not just `authenticated` — because before this fix
-- both functions carried Postgres's default PUBLIC execute grant, and an
-- RLS policy evaluated in an anon context (however unlikely per Doc 01,
-- since the app requires auth throughout) that calls one of these
-- functions should still get a quiet `false`/empty-role result, the same
-- "quiet no-op" shape already established elsewhere in this repo (0025's
-- own comment on get_digest_summary), rather than a hard "permission
-- denied for function" error that would be a new, unrelated regression
-- introduced by this fix.
-- =============================================================================

-- SECOND, INDEPENDENT INSTANCE of the exact same bug pattern, found while
-- checking every other predicate function for the same shape before
-- considering this fix complete: `is_project_member()` (0006) queries
-- `project_memberships` directly. `project_memberships`'s own SELECT
-- policy — `project_memberships_select_member` — is
-- `using (is_org_member(org_id) or is_project_member(project_id))`, which
-- calls `is_project_member()` again. Same infinite recursion, entirely
-- independent of the `organization_members`/`is_org_member` cycle above —
-- this is why the rollup-isolation suite's plain `projects` SELECT
-- (`projects_select_lead_or_trade` calls `is_project_member(id)`) hit
-- "stack depth limit exceeded" even though that policy's OTHER predicate,
-- `is_org_member(lead_org_id)`, is already fixed above. Same fix, same
-- safety reasoning: the WHERE clause already scopes to
-- `pm.project_id = target_project and om.user_id = auth.uid()`, so
-- bypassing RLS on the internal lookup exposes nothing beyond what the
-- function's own predicate already answers for the caller.
--
-- Checked and confirmed NOT affected by this pattern, so deliberately
-- left unchanged: `is_own_worker()` (0019) and `is_org_participant()`
-- (0020) both query `workers`, whose only SELECT policy
-- (`workers_select_member`, 0005) uses `is_org_member()`/`org_role_of()`
-- — both already fixed above, so no self-recursion reaches back into
-- either function. `is_project_participant()` (0034) and
-- `is_project_active()` (0038) both query `projects` directly, gated by
-- `projects_select_lead_or_trade`, which itself only calls
-- `is_org_member()`/`is_project_member()` — both fixed here — so no cycle
-- reaches back into either of those two functions either. None of the
-- four needed this same treatment.

create or replace function is_project_member(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from project_memberships pm
    join organization_members om on om.org_id = pm.org_id
    where pm.project_id = target_project and om.user_id = auth.uid()
  );
$$;

revoke execute on function is_project_member(uuid) from public;
grant execute on function is_project_member(uuid) to anon, authenticated;

comment on function is_project_member(uuid) is
  'RLS predicate: does the current user''s org have a membership on this project (lead or trade)? security definer since 0039 — its own internal lookup against project_memberships must bypass that table''s RLS (which itself calls this function), or every evaluation recurses infinitely, independent of the is_org_member()/organization_members cycle also fixed in 0039. Safe for the same reason: the WHERE clause already scopes to auth.uid() and the target project.';

create or replace function is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where org_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function org_role_of(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from organization_members
  where org_id = target_org and user_id = auth.uid();
$$;

revoke execute on function is_org_member(uuid) from public;
revoke execute on function org_role_of(uuid) from public;

grant execute on function is_org_member(uuid) to anon, authenticated;
grant execute on function org_role_of(uuid) to anon, authenticated;

comment on function is_org_member(uuid) is
  'RLS predicate: does the current user belong to this org, in any role? Table-lookup, never JWT claims. security definer since 0039 — its own internal lookup against organization_members must bypass that table''s RLS (which itself calls this function), or every evaluation recurses infinitely. Safe: the WHERE clause already scopes to auth.uid(), so bypassing RLS here exposes nothing beyond the caller''s own membership row.';
comment on function org_role_of(uuid) is
  'RLS predicate: current user''s role (owner/manager/viewer) in this org, or NULL if not a member. security definer since 0039 — same recursion fix and same safety reasoning as is_org_member(uuid).';
