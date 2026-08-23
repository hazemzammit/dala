-- =============================================================================
-- 0073_phase8_backend_blocked.sql
-- Improvement-plan §11 "Phase 8 — Backend-blocked items": §1.7 (dashboard
-- activity feed), §1.9 (materials cost + project_expenses link), §1.3
-- steps 2-3 (vehicle maintenance log + document/insurance expiry).
-- See docs/PHASE_8_BRIEF.md for the full investigation and reasoning this
-- migration is built on. Three independent pieces, kept in one file per
-- this repo's own one-migration-per-phase convention (Phase 3's 0070,
-- Phase 4's 0071, Phase 6's 0072 all bundle several unrelated columns/
-- tables the same way).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Part 1 — §1.7 Dashboard activity feed
--
-- STEP 1 FINDING: `audit_log` (0009) is exclusively written by the Admin
-- app's `logAdminAction()` (apps/admin/src/lib/audit-log.ts) — grepped
-- every call site before concluding this: feature_flag.*, admin.*, user.*,
-- billing.*, note.*, db_explorer.*, org.restore, admin.reset_totp, session
-- revoke/login events. Zero org-level "a worker logged a site entry" or
-- "an expense was recorded" style events exist in it, and zero ever will
-- under the Admin app's own current design. RLS-ing `audit_log` open to
-- org members, as §1.7's literal wording suggests as one option, would
-- surface either an empty feed (an org with no platform-admin action ever
-- taken against it — the overwhelmingly common case) or, worse, the WRONG
-- feed: platform-admin actions like `admin.impersonate_start` are not
-- something a contractor should see attributed to "activity on my
-- account" at all. §1.7's own fix text offers the explicit alternative —
-- "add RLS policies to audit_log (or build a dedicated feed table)" — and
-- the dedicated-table path is the only one that produces the feed a
-- contractor actually wants: their own org's own field activity.
--
-- Populated by AFTER INSERT triggers on four existing tables, not by
-- threading an explicit feed-insert call through every mobile screen that
-- creates one of these rows. Two reasons: (1) a trigger can never be
-- forgotten by a future call site the way a manual insert can — this
-- table's whole value is being a complete, trustworthy record; (2) it
-- keeps the feed accurate for BOTH the online path (materials.tsx,
-- vehicles.tsx — plain supabase inserts) and any offline-first path
-- (site_logs via submit_site_log_entry, dispatch_assignments) without
-- needing two different insertion strategies per source table.
--
-- Starter set — bounded and defensible, not "every table that changes":
--   - site_logs      -> 'site_log_added'      (journal entry, any author)
--   - project_expenses -> 'expense_recorded'   (includes the §1.9 cost push below)
--   - safety_incidents -> 'safety_incident_reported'
--   - dispatch_assignments -> 'dispatch_assigned'
-- These four are exactly Doc 05 §2.2's own "site log added, expense
-- recorded, safety incident reported, dispatch assigned" framing quoted
-- in the plan's own §1.7 fix text — not invented here, carried over from
-- it. Explicitly NOT included: materials requests (already visible via
-- materials.tsx's own pending-count badge, which is a stronger signal
-- than a feed row for that specific action), attendance_records (would
-- fire once per worker per pointage save, several times a day per org —
-- too high-frequency to be a meaningful "what happened" feed rather than
-- noise), advances (financial-approval flows already have their own
-- dedicated screen and pending-count badge, same reasoning as materials).
-- A future phase can widen this set; narrow-and-documented was chosen
-- over broad-and-noisy for a first cut.
--
-- No backfill: `created_at default now()` on the table means every row
-- in it comes from a trigger firing after this migration applies. Every
-- existing site_logs/project_expenses/safety_incidents/dispatch_assignments
-- row from before this migration has no corresponding feed entry, and none
-- is synthesized — the plan's own instruction ("feed starts from whenever
-- this phase ships, not retroactive").
-- -----------------------------------------------------------------------------

create table org_activity_feed (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  event_type    text not null check (event_type in (
                  'site_log_added', 'expense_recorded',
                  'safety_incident_reported', 'dispatch_assigned'
                )),
  actor_id      uuid references profiles(id),
  project_id    uuid references projects(id),
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index org_activity_feed_org_id_created_at_idx on org_activity_feed (org_id, created_at desc);

comment on table org_activity_feed is
  'Improvement-plan §1.7 — dedicated dashboard activity feed table, NOT a repurposing of audit_log (see this migration''s own header for why: audit_log is exclusively platform-admin actions, confirmed by grepping every apps/admin logAdminAction() call site). Populated only by the AFTER INSERT triggers below, no client-facing INSERT policy exists — org members can only SELECT their own org''s rows.';

alter table org_activity_feed enable row level security;
create policy "org_activity_feed_select_member" on org_activity_feed
  for select using (is_org_member(org_id));
-- Deliberately no insert/update/delete policy for authenticated — every
-- row is written by a trigger function below, which runs with the
-- privileges of its owner (the migration-applying role) and so bypasses
-- RLS the normal Postgres way; no client can write here directly, by
-- construction, not by a policy that could be loosened by mistake.

create or replace function record_site_log_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into org_activity_feed (org_id, event_type, actor_id, project_id, metadata)
  values (new.org_id, 'site_log_added', new.logged_by, new.project_id,
    jsonb_build_object('has_photo', new.photo_url is not null, 'has_voice', new.voice_note_url is not null));
  return new;
end;
$$;
revoke execute on function record_site_log_activity() from public, anon, authenticated;
create trigger site_logs_record_activity
  after insert on site_logs
  for each row execute function record_site_log_activity();

create or replace function record_expense_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into org_activity_feed (org_id, event_type, actor_id, project_id, metadata)
  values (new.org_id, 'expense_recorded', new.created_by, new.project_id,
    jsonb_build_object('category', new.category, 'amount', new.amount));
  return new;
end;
$$;
revoke execute on function record_expense_activity() from public, anon, authenticated;
create trigger project_expenses_record_activity
  after insert on project_expenses
  for each row execute function record_expense_activity();

create or replace function record_safety_incident_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into org_activity_feed (org_id, event_type, actor_id, project_id, metadata)
  values (new.org_id, 'safety_incident_reported', new.reported_by, new.project_id,
    jsonb_build_object('severity', new.severity, 'incident_type', new.incident_type));
  return new;
end;
$$;
revoke execute on function record_safety_incident_activity() from public, anon, authenticated;
create trigger safety_incidents_record_activity
  after insert on safety_incidents
  for each row execute function record_safety_incident_activity();

create or replace function record_dispatch_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- dispatch_assignments has no "who created this" column (confirmed by
  -- reading 0006 again) — actor_id stays null for this event type; the
  -- feed row is still meaningful ("worker X was dispatched to project Y"
  -- doesn't need an author the way a journal entry or an expense does).
  insert into org_activity_feed (org_id, event_type, actor_id, project_id, metadata)
  values (new.org_id, 'dispatch_assigned', null, new.project_id,
    jsonb_build_object('worker_id', new.worker_id, 'vehicle_id', new.vehicle_id, 'assignment_date', new.assignment_date));
  return new;
end;
$$;
revoke execute on function record_dispatch_activity() from public, anon, authenticated;
create trigger dispatch_assignments_record_activity
  after insert on dispatch_assignments
  for each row execute function record_dispatch_activity();


-- -----------------------------------------------------------------------------
-- Part 2 — §1.9 Materials: cost field + project_expenses link
--
-- Item 1 ("let the contractor initiate a material request directly") needs
-- NO RLS change — confirmed by Step 1: `materials_write_owner_manager`
-- (0008) is `for all using (org_role_of(org_id) in ('owner', 'manager'))`
-- with no separate `with check`. Per Postgres RLS semantics, a `for all`
-- policy with no explicit `with check` uses its `using` clause as the
-- check for INSERT too — so an owner/manager can already INSERT into
-- `materials` today. This is a pure UI gap (confirmed by reading
-- materials.tsx in full: zero create-form code, only handleApprove/
-- handleRefuse/handleReassign), closed in the mobile app, not here.
--
-- Item 2 needs exactly one column plus the idempotent approval RPC below.
-- -----------------------------------------------------------------------------

alter table materials add column cost numeric(10, 2);

comment on column materials.cost is
  'Improvement-plan §1.9 item 2 — optional. Set by an owner/manager (existing materials_write_owner_manager policy already covers this column, no RLS change) either at contractor-initiated creation or while reviewing a pending request before approving. When set and materials.project_id is also set, approve_material_request() below pushes a matching project_expenses row (category=''materiaux'') on approval. No NOT NULL / no check(cost > 0) — unlike project_expenses.amount, a $0 or unset cost is a legitimate "no cost tracked for this request" state, not an error.';

-- materials.project_id is nullable (0008); project_expenses.project_id is
-- NOT NULL (0007) — the real conflict Step 1 flagged. Resolution, decided
-- and documented here rather than left implicit in application code:
-- approval ALWAYS succeeds regardless of whether project_id is set. If
-- cost is set but project_id is null, the expense push is skipped and the
-- RPC's return value carries a flag the mobile client uses to surface why
-- (materials.tsx shows "Approuvé, mais non ajouté aux dépenses (aucun
-- chantier associé)" rather than silently losing the cost). The
-- alternative — blocking approval until a project is assigned — was
-- rejected: approve/refuse/reassign is core, frequently-used contractor
-- workflow, and gating it on an unrelated budget-tracking precondition
-- would add friction to the common case (approving a request with no
-- cost tracked at all, which needs no project) to protect an edge case
-- (a costed request with no project) that the UI can just as honestly
-- surface after the fact instead of blocking before it.
--
-- Idempotency-gated, mirroring approve_advance (0019) exactly, even
-- though Doc 01 §1.11.3's own literal list doesn't name this endpoint —
-- disclosed judgment call, not a silent scope expansion: §1.11.3 was
-- written before this endpoint could write to project_expenses at all
-- (materials had no cost column until this migration). Once approval can
-- create a real financial-ledger row, the same double-tap/retry-after-
-- timeout risk approve_advance/mark_salary_cycle_paid protect against
-- applies here too — a duplicate project_expenses row would silently
-- inflate a project's budget-consumed percentage. materials.tsx's own
-- pre-Phase-8 header comment already anticipated this exact call:
-- "If a future pass adds a cost field and wires approval to the expense
-- ledger, THAT's the point this action needs to move behind an idempotent
-- RPC... not before." Refuse/reassign are UNCHANGED — still plain
-- updates under materials_write_owner_manager, per that same comment's
-- own reasoning (neither moves money).
create or replace function approve_material_request(
  p_material_id uuid,
  p_idempotency_key uuid
)
returns table (material materials, expense_pushed boolean, expense_skipped_reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target materials;
  v_request_hash text;
  v_existing idempotency_keys;
  v_material materials;
  v_expense_pushed boolean := false;
  v_skip_reason text := null;
begin
  select * into v_target from materials where id = p_material_id;
  if not found then
    raise exception 'material_not_found';
  end if;

  if org_role_of(v_target.org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if v_target.status <> 'pending' then
    raise exception 'material_not_pending';
  end if;

  v_request_hash := md5(coalesce(p_material_id::text, ''));

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    -- Replay: report the ALREADY-decided outcome from the first run's
    -- response_body rather than re-deriving it, so a retried request
    -- can never report a different expense_pushed/reason than the
    -- request that actually executed the write.
    select * into v_material from materials where id = p_material_id;
    return query select v_material,
      coalesce((v_existing.response_body ->> 'expense_pushed')::boolean, false),
      v_existing.response_body ->> 'expense_skipped_reason';
    return;
  end if;

  update materials
  set status = 'approved', approved_by = auth.uid()
  where id = p_material_id
  returning * into v_material;

  if v_material.cost is not null and v_material.cost > 0 then
    if v_material.project_id is null then
      v_skip_reason := 'no_project_linked';
    else
      insert into project_expenses (org_id, project_id, category, amount, description, created_by)
      values (v_material.org_id, v_material.project_id, 'materiaux', v_material.cost, v_material.item, auth.uid());
      v_expense_pushed := true;
    end if;
  end if;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_target.org_id, 'approve_material_request', v_request_hash, 200,
    jsonb_build_object('id', v_material.id, 'expense_pushed', v_expense_pushed, 'expense_skipped_reason', v_skip_reason));

  return query select v_material, v_expense_pushed, v_skip_reason;
end;
$$;

grant execute on function approve_material_request(uuid, uuid) to authenticated;

comment on function approve_material_request(uuid, uuid) is
  'Improvement-plan §1.9 item 2. Owner/manager only, idempotency-checked (see this migration''s own header for why, given Doc 01 §1.11.3''s literal list predates this endpoint''s ability to write project_expenses). Pushes a project_expenses row (category=materiaux) when materials.cost is set AND materials.project_id is set; otherwise approval still succeeds and expense_skipped_reason reports why no expense was recorded.';


-- -----------------------------------------------------------------------------
-- Part 3 — §1.3 steps 2-3: vehicle maintenance log + document/insurance
-- expiry tracking
--
-- Both tables below are modeled APPEND-ONLY, same offline-conflict shape
-- Doc 01 §1.9.1 already uses for advances/attendance/site logs/material
-- requests — "an offline write is always an INSERT... there is no
-- conflict to resolve, by construction." This is a deliberate choice for
-- vehicle_documents specifically, not just the obviously-append-only
-- maintenance log:
--
-- vehicle_maintenance_log is a natural fit — the plan's own fix text
-- ("date, description, cost, logged by... a history view") describes a
-- LOG, and a log of past service events is never edited after the fact,
-- only added to.
--
-- vehicle_documents is the judgment call: a document's expiry date DOES
-- change when a policy/inspection is renewed, which could instead be
-- modeled as one row per document TYPE that gets UPDATEd on renewal (the
-- "editable-record" category Doc 01 §1.9.1 puts vehicles itself in, with
-- a version column). Chose append-only instead — a new row per
-- recording, "current" resolved as the most recent row per
-- (vehicle_id, document_type) — for three reasons: (1) it needs no new
-- version-column/optimistic-concurrency machinery the plan didn't ask
-- for here (§1.3 steps 2-3 name a log and a due-soon badge, not a
-- conflict-resolution scheme); (2) a renewal history ("when was this
-- last renewed, and before that") is itself useful and free with this
-- shape, versus a single mutable row that discards the prior expiry the
-- moment it's overwritten; (3) it keeps vehicle_maintenance_log and
-- vehicle_documents structurally identical (both are "date-stamped
-- entries added over time, never edited"), which is a simpler mental
-- model for this one phase's two closely-related new tables than having
-- one append-only and one editable-with-version-column right next to
-- each other. No RPC needed for either table's writes, same reasoning
-- 0020's own comment gives for materials_insert_self: owner/manager
-- INSERT is a direct, correct predicate `org_role_of(org_id) in
-- ('owner','manager')`, no worker-identity-resolution subtlety to
-- protect that a plain policy can't already cover.
-- -----------------------------------------------------------------------------

create table vehicle_maintenance_log (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  vehicle_id   uuid not null references vehicles(id) on delete cascade,
  log_date     date not null default current_date,
  description  text not null,
  cost         numeric(10, 2),
  logged_by    uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create index vehicle_maintenance_log_vehicle_id_idx on vehicle_maintenance_log (vehicle_id, log_date desc);

comment on table vehicle_maintenance_log is
  'Improvement-plan §1.3 step 2. Append-only (Doc 01 §1.9.1 style, see this migration''s Part 3 header) — a maintenance history, never edited after entry.';

alter table vehicle_maintenance_log enable row level security;
create policy "vehicle_maintenance_log_select_member" on vehicle_maintenance_log
  for select using (is_org_member(org_id));
create policy "vehicle_maintenance_log_insert_owner_manager" on vehicle_maintenance_log
  for insert with check (org_role_of(org_id) in ('owner', 'manager'));

create table vehicle_documents (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  vehicle_id      uuid not null references vehicles(id) on delete cascade,
  document_type   text not null,   -- closed-ish list at the app layer (Select.tsx "Autre"), same free-text-with-preset pattern as workers.trade/organizations.trade_type (Phase 4)
  document_url    text,
  expires_at      date not null,
  recorded_by     uuid references profiles(id),
  created_at      timestamptz not null default now()
);

create index vehicle_documents_vehicle_id_idx on vehicle_documents (vehicle_id, document_type, created_at desc);

comment on table vehicle_documents is
  'Improvement-plan §1.3 step 3. Append-only, same reasoning as vehicle_maintenance_log above — a new row per recording, NOT an update to a mutable "current" row. The currently-relevant document of a given type is the most recent row for that (vehicle_id, document_type) pair, resolved at query time (DISTINCT ON), not stored as a separate flag. Deliberately NOT the same table as org_insurances (0008) — that table is the ORG''s own liability insurance, a different concept (confirmed by reading its schema before concluding this), not a per-vehicle registration/inspection/policy record.';

alter table vehicle_documents enable row level security;
create policy "vehicle_documents_select_member" on vehicle_documents
  for select using (is_org_member(org_id));
create policy "vehicle_documents_insert_owner_manager" on vehicle_documents
  for insert with check (org_role_of(org_id) in ('owner', 'manager'));
