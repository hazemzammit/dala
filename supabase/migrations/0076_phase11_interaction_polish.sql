-- =============================================================================
-- 0076_phase11_interaction_polish.sql
-- Improvement-plan §11 "Phase 11 — Interaction polish" (§9.2, §9.5).
--
-- Part 1 — Vehicle soft-delete + restore (§9.2)
-- Part 2 — Expense soft-delete + restore (§9.2, "lower-stakes" toast case)
-- Part 3 — purge_soft_deleted_records() extended to vehicles
-- Part 4 — Client-portal branding (§9.5): verify_client_portal_access() now
--          returns the org name + a signed-URL-free logo path, so the portal
--          page can show the SAME branding §1.4 already wired into the
--          switcher/dashboard/PDF reports — this was the one place that
--          work never reached (confirmed by reading the function's return
--          shape before this migration; it selected `name, status,
--          budget_total` off `projects` only, nothing from `organizations`).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — Vehicle soft-delete (§9.2 "extend soft-delete + trash/restore to
-- vehicles"). Same shape as workers.deleted_at (0025)/projects.deleted_at
-- (0013) — reusing the established pattern, not inventing a status enum.
--
-- RLS: no new policy needed. "vehicles_write_owner_manager" (0006) is a
-- `for all` policy with no separate `with check`, so it already covers the
-- UPDATE that soft_delete_vehicle()/restore_vehicle() perform — confirmed
-- by reading that policy directly before writing this, same check already
-- made for workers/site_logs in 0025/0072. Functions below are plain `sql`
-- (invoker rights, not `security definer`) for the same reason
-- soft_delete_worker()/restore_worker() are — RLS is already the correct
-- gate, no extra in-function role check is needed on top of it.
-- ---------------------------------------------------------------------------

alter table vehicles add column deleted_at timestamptz;

comment on column vehicles.deleted_at is
  'Improvement-plan Phase 11 (§9.2) — 30-day recoverable soft-delete, same pattern as workers.deleted_at (0025)/projects.deleted_at (0013).';

create or replace view active_vehicles as
  select * from vehicles where deleted_at is null;

create or replace function soft_delete_vehicle(p_vehicle_id uuid)
returns void language sql as $$
  update vehicles set deleted_at = now() where id = p_vehicle_id;
$$;

create or replace function restore_vehicle(p_vehicle_id uuid)
returns void language sql as $$
  update vehicles set deleted_at = null
  where id = p_vehicle_id and deleted_at > now() - interval '30 days';
$$;

revoke execute on function soft_delete_vehicle(uuid) from public;
revoke execute on function restore_vehicle(uuid) from public;
grant execute on function soft_delete_vehicle(uuid) to authenticated;
grant execute on function restore_vehicle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 2 — Expense soft-delete (§9.2 "for lower-stakes deletes (a journal
-- entry, an expense row), replace the modal confirm with a lighter
-- 'Supprimé · Annuler' toast"). DISCLOSED SCOPE NOTE: unlike vehicles/
-- journal, expenses is NOT named in §9.2's own "extend trash/restore to
-- vehicles and journal entries" sentence — only in the separate
-- lower-stakes-toast example list. So this soft-delete exists at the DB
-- layer (a real delete needs SOME server-side representation for the
-- UndoToast's undo window to restore from), but is deliberately NOT
-- surfaced in trash.tsx and NOT added to purge_soft_deleted_records() below
-- — seePHASE_11_BRIEF.md §3 for the full disclosed trade-off (if the
-- toast's undo window elapses unactioned, there is currently no further
-- in-app recovery path for an expense row; a future phase adding it to
-- trash.tsx would be a small, disclosed follow-up, not a design change).
-- ---------------------------------------------------------------------------

alter table project_expenses add column deleted_at timestamptz;

comment on column project_expenses.deleted_at is
  'Improvement-plan Phase 11 (§9.2) — soft-delete backing the UndoToast''s undo window on expenses.tsx. Deliberately NOT surfaced in trash.tsx and NOT purged by purge_soft_deleted_records() this phase — see PHASE_11_BRIEF.md §3.';

create or replace function soft_delete_expense(p_expense_id uuid)
returns void language sql as $$
  update project_expenses set deleted_at = now() where id = p_expense_id;
$$;

create or replace function restore_expense(p_expense_id uuid)
returns void language sql as $$
  update project_expenses set deleted_at = null
  where id = p_expense_id and deleted_at > now() - interval '30 days';
$$;

revoke execute on function soft_delete_expense(uuid) from public;
revoke execute on function restore_expense(uuid) from public;
grant execute on function soft_delete_expense(uuid) to authenticated;
grant execute on function restore_expense(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 3 — purge_soft_deleted_records() extended to vehicles only, mirroring
-- 0025's own extension from projects-only to projects+workers. project_expenses
-- is deliberately NOT added here — see Part 2's disclosed scope note above;
-- purging a soft-deleted expense after 30 days would be premature when this
-- phase never gives it a restore SURFACE to be purged away from.
-- ---------------------------------------------------------------------------

create or replace function purge_soft_deleted_records()
returns integer language plpgsql as $$
declare
  purged_count integer;
  workers_purged integer;
  vehicles_purged integer;
begin
  delete from projects where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics purged_count = row_count;

  delete from workers where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics workers_purged = row_count;

  delete from vehicles where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics vehicles_purged = row_count;

  return purged_count + workers_purged + vehicles_purged;
end;
$$;

-- ---------------------------------------------------------------------------
-- Part 4 — Client-portal branding (§9.5). verify_client_portal_access()
-- (0074) previously returned nothing from `organizations` at all — the
-- portal page had no org name/logo to show even though §1.4's logo work
-- shipped everywhere else (switcher, dashboard, PDF reports) back in
-- Phase 2/5. Adds `org_name`/`org_logo_url` to the returned jsonb. The
-- logo value is the bare STORAGE PATH (never a direct URL — Doc 01
-- §1.3.11), same as every other logo_url read in this schema; the ANON
-- web page mints its own signed URL client-side-adjacent by calling a new,
-- narrow `get_org_logo_signed_url(p_token text)` SECURITY DEFINER RPC
-- (below) rather than embedding a service-role-signed URL in the jsonb
-- payload above (a signed URL embedded in a cached/logged response would
-- outlive its own 60s mint if the page held onto it — minting on demand,
-- the same way generate-report already does per §9.5's own read-first
-- instruction, avoids that).
-- ---------------------------------------------------------------------------

create or replace function verify_client_portal_access(p_token text, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal client_portals;
  v_project projects;
  v_org_name text;
  v_org_logo_url text;
  v_consumed numeric(12, 2);
  v_invoices jsonb;
begin
  select * into v_portal from client_portals where link_token = p_token;
  if v_portal.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_portal.locked_until is not null and v_portal.locked_until > now() then
    return jsonb_build_object('status', 'locked', 'locked_until', v_portal.locked_until);
  end if;

  if v_portal.pin_enabled then
    if p_pin is null or v_portal.pin_hash is null or crypt(p_pin, v_portal.pin_hash) <> v_portal.pin_hash then
      update client_portals
        set failed_pin_attempts = failed_pin_attempts + 1,
            locked_until = case when failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
        where id = v_portal.id;
      return jsonb_build_object('status', 'pin_required');
    end if;
    update client_portals set failed_pin_attempts = 0, locked_until = null where id = v_portal.id;
  end if;

  select * into v_project from projects where id = v_portal.project_id;

  -- Improvement-plan Phase 11 §9.5 — org branding for the portal page.
  select o.name, o.logo_url into v_org_name, v_org_logo_url
  from organizations o where o.id = v_project.lead_org_id;

  select coalesce(sum(amount), 0) into v_consumed
  from project_expenses where project_id = v_project.id and deleted_at is null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'invoice_number', i.invoice_number,
           'issued_at', i.issued_at,
           'due_date', i.due_date,
           'subtotal', i.subtotal
         ) order by i.issued_at desc), '[]'::jsonb)
    into v_invoices
  from invoices i where i.project_id = v_project.id;

  return jsonb_build_object(
    'status', 'ok',
    'project_name', v_project.name,
    'project_status', v_project.status,
    'budget_total', v_project.budget_total,
    'budget_consumed', v_consumed,
    'invoices', v_invoices,
    'org_name', v_org_name,
    'org_logo_url', v_org_logo_url
  );
end;
$$;

-- Note the `deleted_at is null` addition to the consumed-total sum above —
-- verify_client_portal_access() (0074) summed EVERY project_expenses row for
-- the project, with no soft-delete filter, because project_expenses had no
-- deleted_at column until this migration's own Part 2. Left unfiltered it
-- would have shown a client a budget-consumed figure that includes rows the
-- contractor has since deleted — fixed here, in the same migration that
-- introduces the column, rather than left as a fresh bug for a future phase
-- to discover.

grant execute on function verify_client_portal_access(text, text) to anon;

-- Improvement-plan Phase 11 §9.5 — narrow, anonymous, single-purpose:
-- mints a signed URL for one org's logo, given a valid client-portal token
-- (not a bare org_id — an anonymous caller must never be able to fetch an
-- arbitrary org's logo by guessing an id). Mirrors
-- get_worker_invitation_by_token (0017)'s "SECURITY DEFINER + anon grant is
-- the correct shape for a token-authenticated, session-less caller" pattern.
create or replace function get_org_logo_signed_url(p_token text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal client_portals;
  v_project projects;
  v_logo_path text;
begin
  select * into v_portal from client_portals where link_token = p_token;
  if v_portal.id is null then
    return null;
  end if;

  select * into v_project from projects where id = v_portal.project_id;

  select o.logo_url into v_logo_path
  from organizations o where o.id = v_project.lead_org_id;

  if v_logo_path is null then
    return null;
  end if;

  -- storage.foldername/objects introspection isn't needed here — signing is
  -- a pure Storage API operation over a known bucket+path, same
  -- 'org-files' bucket every other logo_url read in this schema already
  -- uses (Phase 5's own bucket-name correction, generate-report/index.ts).
  return (
    select signed_url from storage.create_signed_url('org-files', v_logo_path, 3600)
  );
exception
  -- storage.create_signed_url isn't guaranteed to exist as a plain SQL-
  -- callable function across every Supabase Storage extension version
  -- (confirmed uncertain by reading the installed extension's own catalog
  -- comments, not by running it against a live instance — no Docker/live
  -- Supabase in this sandbox, same standing constraint every prior brief
  -- discloses). Falling back to null (no logo shown) rather than a hard
  -- error keeps a broken logo path from ever breaking the whole portal
  -- page, matching generate-report's own "every step is non-fatal" logo
  -- design (Phase 5 brief §1).
  when others then
    return null;
end;
$$;

grant execute on function get_org_logo_signed_url(text) to anon;

comment on function get_org_logo_signed_url(text) is
  'Improvement-plan Phase 11 (§9.5). UNVERIFIED against a live Supabase Storage instance — storage.create_signed_url()''s exact callable signature was reasoned from Supabase''s documented Storage SQL helpers, not executed (no Docker/live instance in this sandbox). See PHASE_11_BRIEF.md verification list.';
