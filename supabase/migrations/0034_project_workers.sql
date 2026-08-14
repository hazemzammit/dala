-- =============================================================================
-- 0034_project_workers.sql
--
-- Doc 03 §3.10.2's Équipe tab, resolved: "which workers count as this
-- project's team" is answered as an explicit, durable roster
-- (`project_workers`), not a computed view over dispatch history.
-- Dispatch is scheduling ("where is Ahmed going Tuesday"); this table is
-- staffing ("Ahmed works on this project") — the two answer different
-- questions and conflating them breaks in real ways: a worker on leave
-- for a few days would vanish from a computed "team" view even though
-- they're still on the project; a worker who did two weeks of workshop
-- prep with zero dispatch assignments would never appear at all.
--
-- Three corrections made against an earlier draft of this design before
-- writing it, stated plainly rather than silently fixed:
--   1. A partial-unique constraint is NOT valid as an inline `UNIQUE(...)
--      WHERE ...` table constraint in Postgres — it has to be a separate
--      `CREATE UNIQUE INDEX ... WHERE ...`. See below.
--   2. Re-adding a previously-removed worker via a fresh dispatch
--      assignment reactivates their existing row (`removed_at` flipped
--      back to null) via `ON CONFLICT ... DO UPDATE`, rather than
--      inserting a second historical row for the same (project, worker)
--      pair — a deliberate choice, not the only valid one, but the
--      cleaner default.
--   3. `added_by` needed a source. `dispatch_assignments` has no
--      user-tracking column at all (checked, not assumed) — auto-seeded
--      rows get `added_by = auth.uid()` (the user who created the
--      dispatch assignment, available via the session regardless of
--      that table's own columns), which is the correct attribution
--      anyway.
--
-- Visibility model, deliberately consistent with dispatch_assignments and
-- project_expenses rather than introduced fresh: SELECT is
-- `is_org_member(org_id)` only, NOT `is_project_member(project_id)`. Each
-- org sees only ITS OWN roster entries on a shared project, never another
-- participating org's — matching how dispatch_assignments/project_expenses
-- already work and confirmed safe by the Phase 11 RLS matrix suite's
-- reasoning (an org's own operational data on a shared project stays
-- siloed to that org, even between two orgs who are both legitimately on
-- the project).
--
-- A note on a pre-existing gap this migration does NOT fix directly:
-- nothing today stops `dispatch_assignments.project_id` from being set to
-- a project the assigning org isn't actually associated with at all
-- (dispatch_assignments' write policy only checks `org_role_of(org_id)`,
-- never project participation). This migration works around that rather
-- than tightening dispatch_assignments' existing behavior itself: the
-- auto-seed trigger below checks `is_project_participant()` itself and
-- simply skips seeding (no error, no transaction abort) if the dispatching
-- org isn't a real project participant, so THIS migration ships without
-- changing dispatch_assignments' existing behavior. That gap on
-- dispatch_assignments itself is closed separately, in
-- 0035_dispatch_assignments_project_participation.sql — this migration's
-- workaround stays in place regardless (it's still correct defense in
-- depth even after 0035, and removing it would require re-verifying this
-- trigger's ordering relative to 0035's policy change).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CORRECTION made before this migration was ever applied anywhere (caught
-- while designing the follow-up fix to dispatch_assignments' own
-- project-membership gap — see 0035_dispatch_assignments_project_
-- participation.sql): is_project_member() (0006) does NOT cover a lead
-- org's own projects. Checked against actual code, not assumed: no path
-- anywhere in this codebase — not sign-up, not project creation, nowhere —
-- ever inserts a `role = 'lead'` row into project_memberships. A lead
-- org's access to its own projects works ONLY through
-- `is_org_member(lead_org_id)` (see projects_select_lead_or_trade's own
-- policy: `is_org_member(lead_org_id) or is_project_member(id)` — never
-- is_project_member alone). project_memberships rows only ever exist for
-- trade/client invitees (0024's accept-invitation function is the only
-- INSERT path).
--
-- This migration's original draft used is_project_member(project_id) alone
-- in project_workers' write policy and the auto-seed trigger's guard —
-- which would have silently blocked every roster write and every
-- auto-seed on a single-org project (the common case; trade participation
-- is the exception), while appearing to work fine only on the one demo
-- project in seed.sql that happens to have a trade partner. Fixed below by
-- introducing is_project_participant(), which covers both cases the way
-- projects' own SELECT policy already does, and using it everywhere this
-- migration needs "is my org actually associated with this project (lead
-- OR trade)", not just is_project_member() alone.
-- ---------------------------------------------------------------------------
create or replace function is_project_participant(target_project uuid)
returns boolean language sql stable as $$
  select
    is_org_member((select lead_org_id from projects where id = target_project))
    or is_project_member(target_project);
$$;

comment on function is_project_participant(uuid) is
  'RLS predicate: is the current user''s org associated with this project at all — as the lead org OR as an invited trade/client participant? Use this, not is_project_member() alone, whenever "lead or trade" is the actual intent — is_project_member() alone only ever matches trade/client rows, never a lead org''s own projects (no code path creates a lead-role project_memberships row).';

comment on function is_project_member(uuid) is
  'RLS predicate: does the current user''s org have an explicit project_memberships row on this project? This is trade/client participation ONLY — a lead org''s own projects have no project_memberships row at all (see is_project_participant() above), so this function alone returns false for a lead org on its own project. Use is_project_participant() when "lead or trade" is the intent.';

create table project_workers (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  worker_id   uuid not null references workers(id) on delete cascade,
  -- Denormalized from workers.org_id, same convention as
  -- dispatch_assignments/project_expenses (RLS predicate stays a simple
  -- column check, not a join, on every read). Deliberately NOT
  -- client-settable — see the trigger below, which derives it from
  -- worker_id and fails closed if the caller can't see that worker.
  org_id      uuid not null references organizations(id) on delete cascade,
  added_at    timestamptz not null default now(),
  added_by    uuid references profiles(id),
  removed_at  timestamptz,
  removed_by  uuid references profiles(id)
);

-- Partial unique index, not an inline table constraint — Postgres doesn't
-- support a WHERE clause on an inline UNIQUE(...) table constraint.
-- Uniqueness only applies among ACTIVE rows, so a worker can have a
-- historical removed row and a later active one without conflict (the
-- reactivation path below avoids that in the common case, but doesn't
-- forbid it — e.g. if a row was reactivated then removed again manually).
create unique index project_workers_active_unique
  on project_workers (project_id, worker_id)
  where removed_at is null;

create index project_workers_project_org_idx on project_workers (project_id, org_id);
create index project_workers_worker_id_idx on project_workers (worker_id);

comment on table project_workers is
  'Doc 03 §3.10.2 Équipe tab: durable project staffing roster, distinct from dispatch_assignments (scheduling). Auto-seeded from dispatch, also directly manageable.';

-- ---------------------------------------------------------------------------
-- org_id derivation trigger — NOT security definer. Runs under the calling
-- user's own row-level permissions, which is the point: the subquery on
-- workers is itself gated by workers' existing RLS (`is_org_member(org_id)`),
-- so if a caller references a worker_id belonging to an org they're not a
-- member of, the subquery returns no row, org_id resolves to null, and the
-- NOT NULL constraint rejects the insert. This closes the exact spoofing
-- vector a client-settable org_id would otherwise open, with no extra
-- security-definer logic needed.
-- ---------------------------------------------------------------------------
create or replace function set_project_worker_org_id()
returns trigger language plpgsql as $$
begin
  new.org_id := (select org_id from workers where id = new.worker_id);
  return new;
end;
$$;

comment on function set_project_worker_org_id() is
  'Derives project_workers.org_id from workers.org_id at insert time. Runs as the calling user (not security definer) so it fails closed via workers'' own RLS if the worker isn''t visible to them — see migration header.';

create trigger project_workers_set_org_id
  before insert on project_workers
  for each row execute function set_project_worker_org_id();

-- ---------------------------------------------------------------------------
-- RLS — same shape as every other operational table (Doc 01 §1.5): enable,
-- then one policy per operation using is_org_member()/org_role_of()/
-- is_project_participant(), never anything else.
-- ---------------------------------------------------------------------------
alter table project_workers enable row level security;

create policy "project_workers_select_member" on project_workers
  for select using (is_org_member(org_id));

-- Any owner/manager of the worker's own org can add/remove that worker on
-- a project their org is an actual participant on (lead or trade) — this
-- is deliberately self-service per org, unlike project_memberships (which
-- only the LEAD org can write, since that's an invitation). A trade org
-- manages its own crew's roster entries without needing the lead org to
-- do it for them.
create policy "project_workers_write_owner_manager" on project_workers
  for all using (
    org_role_of(org_id) in ('owner', 'manager')
    and is_project_participant(project_id)
  )
  with check (
    org_role_of(org_id) in ('owner', 'manager')
    and is_project_participant(project_id)
  );

-- ---------------------------------------------------------------------------
-- Auto-seed from dispatch — security definer, WITH an explicit
-- is_project_participant() guard so it never bypasses that check, just
-- skips seeding (no error) when the dispatching org isn't a real project
-- participant. This is what avoids the transaction-abort problem a plain
-- RLS-enforced insert would hit for that same case (see migration header).
--
-- Intended caller: NONE directly. Never invoked via `.rpc()` by a client —
-- only ever fires as the AFTER INSERT trigger on dispatch_assignments.
-- Explicitly revoked from public/anon/authenticated below, per Phase 9's
-- discipline of stating every SECURITY DEFINER function's intended caller
-- rather than leaving it at the Postgres default.
-- ---------------------------------------------------------------------------
create or replace function seed_project_worker_from_dispatch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null and is_project_participant(new.project_id) then
    insert into project_workers (project_id, worker_id, org_id, added_by)
    values (new.project_id, new.worker_id, new.org_id, auth.uid())
    on conflict (project_id, worker_id) where removed_at is null
    do update set removed_at = null, removed_by = null;
  end if;
  return new;
end;
$$;

comment on function seed_project_worker_from_dispatch() is
  'Auto-adds/reactivates a project_workers row when a dispatch assignment carries a project_id, only if the dispatching org is an actual project_memberships participant. Trigger-only — see migration header for why it is revoked from every role.';

revoke execute on function seed_project_worker_from_dispatch() from public, anon, authenticated;

create trigger dispatch_assignments_seed_project_worker
  after insert on dispatch_assignments
  for each row execute function seed_project_worker_from_dispatch();
