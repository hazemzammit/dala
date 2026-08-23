-- =============================================================================
-- 0072_phase6_history_correction.sql
-- Improvement-plan §11 "Phase 6 — History & correction", §1.2 steps 4
-- (edit-caption / soft-delete for the contractor's own journal entries).
--
-- Everything else Phase 6 touches (attendance history view, explicit
-- correction banner, worker-hub tabs, journal filter row, voice progress
-- bar, grid toggle) is read-only or client-only — this is the ONLY
-- migration this phase needs. Confirmed by re-reading every table this
-- phase's screens touch before writing this file: attendance_records gets
-- no new column (a "correction" is, and remains, a new row — Doc 01
-- §1.9/§1.14.3, unchanged); dispatch_assignments/advances get no new
-- column (the worker-hub tabs are read-only history lists over existing
-- columns, per this phase's own explicit "read-only is an acceptable cut"
-- allowance).
--
-- site_logs is append-only by explicit original design (0008's create,
-- confirmed to carry NO update/delete policy at all across 0008/0020/0024
-- — only site_logs_select_member, site_logs_select_self,
-- site_logs_select_project_shared, site_logs_insert_member exist). Adding
-- a real UPDATE/DELETE RLS policy would contradict that design decision
-- directly — so, same pattern 0025's soft_delete_worker/restore_worker and
-- 0069's submit_site_log_entry widening both already establish in this
-- schema: two new SECURITY DEFINER RPCs, gated in the function body
-- itself (not by RLS, since none exists for this table), rather than a
-- policy change.
--
-- Gating rule, same for all three new functions below: the entry's own
-- author (site_logs.logged_by = auth.uid()) OR an owner/manager of the
-- entry's org (org_role_of(org_id) in ('owner','manager')) — a manager
-- can clean up a contractor's or a worker's mistaken entry; a plain
-- member/viewer cannot edit or delete anyone's entry, including their
-- own note left unresolved by a role change. `is_org_member`/`org_role_of`
-- are the ONLY two permission primitives this schema allows anywhere
-- (docs/ARCHITECTURE.md's own "one authorization pattern" section) — no
-- ad-hoc EXISTS check invented here.
--
-- deleted_at column, not a hard delete: same 30-day-recoverable shape as
-- projects.deleted_at (0006/0013) and workers.deleted_at (0025) — a
-- contractor's field photo/note is exactly the kind of thing a fat-
-- fingered delete on a small phone screen should be recoverable from, not
-- gone forever mid-tap.
--
-- WatermelonDB / sync-engine judgment call, made deliberately, not by
-- default — see this phase's PHASE_6_BRIEF.md §3 for the full reasoning:
-- `deleted_at` is added ONLY to the Postgres table and to
-- packages/shared-types' SiteLog interface, NOT to the local WatermelonDB
-- schema/model. Two independent reasons, both confirmed by reading the
-- actual code before deciding:
--   1. apps/mobile/src/db/sync/pushChanges.ts's pushSiteLogs() already,
--      explicitly, REJECTS any local WatermelonDB UPDATE to site_logs
--      ("this table is append-only; the update was NOT pushed" —
--      console.error, not a throw, but the update never reaches the
--      server either way). Editing/deleting an entry this phase adds is
--      therefore, necessarily, a LIVE supabase.rpc() call from
--      journal.tsx directly — never a local-first WatermelonDB write —
--      so no sync-engine path exists for a deleted_at value to ever flow
--      through in the first place.
--   2. journal.tsx's own loadLogs() already reads the `logs` list live
--      from `supabase.from('site_logs')`, not from the local WatermelonDB
--      mirror — confirmed by reading that function directly. The local
--      site_logs table only ever holds NOT-YET-SYNCED CREATION drafts
--      (SiteLog.ts's own header: "No deletedAt/tombstone field on this
--      model" was already a deliberate prior decision, restated and now
--      actually acted on rather than merely inherited). A soft-delete is
--      a state transition on an already-synced row — there is no code
--      path, before or after this phase, where a locally-drafted,
--      not-yet-pushed row could ever be soft-deleted, so the column would
--      sit unused on every device's local schema.
-- This is the "same reasoning does NOT apply" branch the plan's own Step
-- 1 flagged as a live open question for absence_reason vs. deleted_at —
-- absence_reason is set once, at local creation, and flows through the
-- normal push path unchanged; deleted_at is a transition that only ever
-- happens live, after a row already exists on the server, through a
-- dedicated RPC that bypasses the local-first path entirely.
-- =============================================================================

alter table site_logs add column deleted_at timestamptz;

comment on column site_logs.deleted_at is
  'Improvement-plan Phase 6 (§1.2 step 4) — 30-day recoverable soft-delete, '
  'same pattern as projects.deleted_at (0013) / workers.deleted_at (0025). '
  'Set only via soft_delete_site_log() below, never a direct client update — '
  'site_logs carries no UPDATE RLS policy by design (append-only, 0008). '
  'Readers filter client-side (.is(''deleted_at'', null)), same convention '
  'journal.tsx''s own projects query already uses for projects.deleted_at — '
  'no SELECT policy change needed for this column.';

create or replace function soft_delete_site_log(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log site_logs;
begin
  select * into v_log from site_logs where id = p_log_id;

  if not found then
    raise exception 'site_log_not_found';
  end if;

  if v_log.logged_by is distinct from auth.uid()
     and org_role_of(v_log.org_id) not in ('owner', 'manager') then
    raise exception 'not_authorized';
  end if;

  update site_logs set deleted_at = now() where id = p_log_id;
end;
$$;

create or replace function restore_site_log(p_log_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log site_logs;
begin
  select * into v_log from site_logs where id = p_log_id;

  if not found then
    raise exception 'site_log_not_found';
  end if;

  if v_log.logged_by is distinct from auth.uid()
     and org_role_of(v_log.org_id) not in ('owner', 'manager') then
    raise exception 'not_authorized';
  end if;

  update site_logs
    set deleted_at = null
    where id = p_log_id and deleted_at > now() - interval '30 days';
end;
$$;

create or replace function update_site_log_caption(p_log_id uuid, p_caption text)
returns site_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log site_logs;
begin
  select * into v_log from site_logs where id = p_log_id;

  if not found then
    raise exception 'site_log_not_found';
  end if;

  if v_log.logged_by is distinct from auth.uid()
     and org_role_of(v_log.org_id) not in ('owner', 'manager') then
    raise exception 'not_authorized';
  end if;

  update site_logs set caption = p_caption where id = p_log_id returning * into v_log;
  return v_log;
end;
$$;

revoke execute on function soft_delete_site_log(uuid) from public;
revoke execute on function restore_site_log(uuid) from public;
revoke execute on function update_site_log_caption(uuid, text) from public;

grant execute on function soft_delete_site_log(uuid) to authenticated;
grant execute on function restore_site_log(uuid) to authenticated;
grant execute on function update_site_log_caption(uuid, text) to authenticated;

comment on function soft_delete_site_log(uuid) is
  'Improvement-plan Phase 6 (§1.2 step 4). Gated in-function (site_logs has '
  'no UPDATE RLS policy by design): the entry''s own author OR an '
  'owner/manager of its org. 30-day recoverable via restore_site_log(). '
  'Not wired into trash.tsx this phase — disclosed scope cut, see '
  'PHASE_6_BRIEF.md §2.';

comment on function restore_site_log(uuid) is
  'Improvement-plan Phase 6 (§1.2 step 4). Same gating as soft_delete_site_log(). '
  'Only restores within the 30-day window, same shape as restore_worker() (0025).';

comment on function update_site_log_caption(uuid, text) is
  'Improvement-plan Phase 6 (§1.2 step 4). Same gating as soft_delete_site_log(). '
  'submit_site_log_entry() (0069) remains the only INSERT path and is '
  'unchanged by this function.';
