-- =============================================================================
-- 0074_phase9_new_modules.sql
-- Improvement-plan §11 "Phase 9 — New modules": §2.1-2.2 (instant push +
-- notification-tap deep linking), §2.4 (calendar/planning — client-side
-- only, no schema change), §2.5 (client-facing invoicing), §2.6 (timesheets
-- -> payroll bridge — code-only in generate-report, no schema change),
-- §2.7-2.8 (weather widget — no schema change, see docs/PHASE_9_BRIEF.md;
-- in-app feedback).
-- See docs/PHASE_9_BRIEF.md for the full Step 1 investigation this
-- migration is built on. Four independent pieces, one file, same
-- one-migration-per-phase convention as 0070/0071/0072/0073.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Part 1 — §2.1/§2.2 Instant, event-driven push notifications
--
-- STEP 1 FINDING: there is no single RPC choke point to hang an in-RPC push
-- call off of. Traced every insert path before deciding this:
--   - dispatch_assignments: EITHER a plain `.upsert()` from dispatch.tsx
--     (online path) OR a WatermelonDB-synced `.upsert()` from
--     pushChanges.ts (offline-first path) — confirmed by reading both
--     files. No RPC involved either way.
--   - materials: a plain `.insert()` from EITHER materials.tsx (contractor,
--     online) or material-request.tsx (worker, WatermelonDB-synced). Same
--     shape as dispatch_assignments — no RPC.
--   - safety_incidents: a plain `.insert()` from safety.tsx (online only,
--     confirmed by reading the file — no offline routing for this table).
--
-- This is EXACTLY the shape Phase 8's org_activity_feed trigger design
-- already solved for (see 0073's own header) — "a trigger can't be
-- forgotten by a future call site the way a manual insert can, and it
-- keeps [this] accurate for both the online call sites and any
-- offline-first path without two different insertion strategies." Same
-- AFTER INSERT trigger shape reused here, on the same three tables (plus
-- dispatch_assignments), for the same reason.
--
-- WHAT'S GENUINELY NEW vs. Phase 8's precedent: these triggers call
-- `net.http_post` directly against Expo's push endpoint, not just insert a
-- row into another table. `pg_net` is already a dependency of this project
-- (0026/0027/0030/0032/0043/0050/0061 all schedule `net.http_post` calls via
-- pg_cron), and — more directly relevant here — 0028's
-- `request_phone_change()` already establishes the exact pattern needed:
-- `net.http_post` called SYNCHRONOUSLY from inside a plain PL/pgSQL
-- function body, not only from a cron-scheduled job. That confirms the
-- constraint the plan's own Step 1 flagged ("an Edge Function can't be
-- called synchronously from a Postgres trigger without pg_net or similar")
-- is already resolved in this project — pg_net's `net.http_post` queues the
-- request asynchronously and returns immediately (it's backed by a
-- background worker, not a blocking call), so a trigger firing it adds no
-- meaningful latency to the INSERT it's attached to. No Edge Function is
-- inserted in the middle — the trigger calls Expo's push API directly, the
-- same way `send-digest-notifications` already does from Deno.
--
-- INVITE CREATION — deliberately NOT wired to a push trigger, unlike the
-- three tables above. Traced both invite RPCs before concluding this:
--   - invite_worker (0018/0040): creates a `workers` row (if needed) + a
--     worker_invitations row for someone who, by definition, has no app
--     account yet — there is no profiles row, no expo_push_token, nothing
--     to push to. The invite link/SMS/WhatsApp IS the notification here;
--     that channel already exists and is correctly scoped as "out of this
--     phase."
--   - invite_organization_member (0033): SECURITY INVOKER (not DEFINER),
--     and per its own comment, deliberately has no way to resolve
--     p_email to a user_id — profiles has no email column (0002), and
--     find_user_id_by_email (0015) is intentionally service_role-only.
--     A SECURITY INVOKER function running as the inviting owner has no
--     safe path to look up a push token even if the invited email DOES
--     belong to an existing profile. Forcing this into the trigger
--     pattern would mean adding a service-role-only lookup path that the
--     rest of this function deliberately avoids for a real security
--     reason (see 0033's own comment) — not something to route around
--     quietly inside a Phase 9 push feature.
-- This is a real, disclosed scope finding, not a silent drop — see
-- docs/PHASE_9_BRIEF.md for the same reasoning restated plainly.
--
-- RECIPIENT RESOLUTION per table (none of the three share one shape):
--   - dispatch_assignments -> the ONE assigned worker, via
--     workers.user_id (nullable — a worker who hasn't accepted their app
--     invite has no user_id, and the trigger silently no-ops for them,
--     same "quiet no-op for a non-recipient" shape every other RPC in
--     this repo already uses rather than raising).
--   - materials -> every owner/manager of the org (a material request
--     needs approval from any of them, not one specific person) —
--     fanned out via organization_members.
--   - safety_incidents -> every owner/manager of the org, same fan-out —
--     a safety incident is exactly the kind of event where "notify
--     everyone who can act on it" is correct, not "notify one person."
-- Each push respects the matching notification_prefs key
-- ('dispatch'/'materials'/'safety', migration 0025) and is skipped
-- entirely for a recipient with no expo_push_token yet — mirrors
-- send-digest-notifications' own `.not('expo_push_token', 'is', null)`
-- filter, just expressed per-row instead of per-query.
--
-- PAYLOAD — every push body includes a `data` object
-- ({type, id, ...}) so the mobile tap-listener (apps/mobile/src/lib/
-- pushNotifications.ts, this phase) can route without a second round
-- trip. `type` values ('dispatch'|'material'|'safety') are the same
-- three strings the tap-listener switches on — see that file's own
-- header for the routing table.
-- -----------------------------------------------------------------------------

-- Small shared helper — every trigger below needs "send this Expo push
-- body to this token," and duplicating the same fetch/net.http_post call
-- three times would just be three copies of the one thing that can go
-- subtly out of sync (e.g. one trigger's payload shape drifting from the
-- other two). SECURITY DEFINER + no grants to authenticated/anon: this is
-- an internal plumbing function, callable only from the trigger functions
-- below (which run as the migration-applying role), never directly by a
-- client.
create or replace function send_expo_push(
  p_token text,
  p_title text,
  p_body  text,
  p_data  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_token is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'to', p_token,
      'title', p_title,
      'body', p_body,
      'data', coalesce(p_data, '{}'::jsonb)
    )
  );
end;
$$;
revoke execute on function send_expo_push(text, text, text, jsonb) from public, anon, authenticated;

comment on function send_expo_push(text, text, text, jsonb) is
  'Phase 9 §2.1 — shared Expo push sender, called only from the AFTER INSERT trigger functions below. net.http_post queues the HTTP call against pg_net''s background worker and returns immediately (confirmed pattern: 0028''s request_phone_change already calls net.http_post synchronously from a plain function body, not just from pg_cron) — a trigger calling this adds no meaningful latency to the INSERT it fires on.';

create or replace function notify_dispatch_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_prefs jsonb;
  v_project_name text;
begin
  select p.expo_push_token, p.notification_prefs
    into v_token, v_prefs
  from workers w
  join profiles p on p.id = w.user_id
  where w.id = new.worker_id;

  -- No user_id yet (worker hasn't accepted their app invite) or the
  -- dispatch category is toggled off — quiet no-op, same shape as every
  -- other "not a recipient" branch in this migration.
  if v_token is null then
    return new;
  end if;
  if coalesce((v_prefs->>'dispatch')::boolean, true) is not true then
    return new;
  end if;

  select name into v_project_name from projects where id = new.project_id;

  perform send_expo_push(
    v_token,
    'Nouvelle affectation',
    case
      when v_project_name is not null then 'Vous êtes affecté à ' || v_project_name || ' le ' || to_char(new.assignment_date, 'DD/MM/YYYY') || '.'
      else 'Vous avez une nouvelle affectation le ' || to_char(new.assignment_date, 'DD/MM/YYYY') || '.'
    end,
    jsonb_build_object('type', 'dispatch', 'id', new.id, 'assignment_date', new.assignment_date)
  );
  return new;
end;
$$;
revoke execute on function notify_dispatch_assignment() from public, anon, authenticated;
create trigger dispatch_assignments_notify_push
  after insert on dispatch_assignments
  for each row execute function notify_dispatch_assignment();

create or replace function notify_material_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select p.expo_push_token as token, p.notification_prefs as prefs
    from organization_members om
    join profiles p on p.id = om.user_id
    where om.org_id = new.org_id
      and om.role in ('owner', 'manager')
      and p.expo_push_token is not null
  loop
    if coalesce((v_recipient.prefs->>'materials')::boolean, true) is true then
      perform send_expo_push(
        v_recipient.token,
        'Nouvelle demande de matériaux',
        new.item || case when new.urgency = 'urgent' then ' (urgent)' else '' end,
        jsonb_build_object('type', 'material', 'id', new.id)
      );
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function notify_material_request() from public, anon, authenticated;
create trigger materials_notify_push
  after insert on materials
  for each row execute function notify_material_request();

create or replace function notify_safety_incident()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_recipient record;
begin
  for v_recipient in
    select p.expo_push_token as token, p.notification_prefs as prefs
    from organization_members om
    join profiles p on p.id = om.user_id
    where om.org_id = new.org_id
      and om.role in ('owner', 'manager')
      and p.expo_push_token is not null
  loop
    if coalesce((v_recipient.prefs->>'safety')::boolean, true) is true then
      perform send_expo_push(
        v_recipient.token,
        'Incident de sécurité signalé',
        initcap(new.severity) || ' — ' || left(new.description, 80),
        jsonb_build_object('type', 'safety', 'id', new.id)
      );
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function notify_safety_incident() from public, anon, authenticated;
create trigger safety_incidents_notify_push
  after insert on safety_incidents
  for each row execute function notify_safety_incident();


-- -----------------------------------------------------------------------------
-- Part 2 — §2.5 Client-facing invoicing
--
-- STEP 1 FINDING, stated plainly because it changes this item's real
-- scope: there is NO client-facing portal page anywhere in this repo as of
-- this phase. Confirmed by reading both candidate files directly —
-- apps/mobile/src/app/(contractor)/client-portal.tsx is the CONTRACTOR's
-- own admin screen (generate link, set PIN) and says so explicitly in its
-- own header ("the actual client-facing portal page... is web/portal
-- territory — this screen only ever writes to client_portals via
-- owner/manager-gated RPCs, it never renders the client-facing view").
-- apps/web/src/app/(contractor)/client-portal/page.tsx is an unbuilt
-- EmptyState placeholder. The plan's own §2.5 gap text ("the client portal
-- is read-only status today") describes a screen that doesn't exist yet,
-- not one that exists but lacks invoicing. Migration 0020's own comment on
-- client_portals ("that verification endpoint itself is web/portal
-- scope... the columns it will need to read/write are created now so that
-- work isn't blocked on a follow-up migration") anticipated exactly this
-- gap and left `failed_pin_attempts`/`locked_until` waiting for it.
--
-- This migration builds the schema + RPCs both halves of that gap need:
-- an owner/manager-gated invoice-creation RPC (used from the existing
-- mobile client-portal.tsx admin screen), and an anon-callable
-- verification RPC (used by the new apps/web/src/app/portail/[token] page,
-- this phase — see that file for the actual client-facing rendering).
--
-- INVOICE SHAPE — line_items is a frozen JSONB snapshot taken at
-- generation time from project_expenses for the chosen period, not a live
-- join re-computed on every read. Deliberate: an expense edited or deleted
-- after an invoice was generated must not silently change a document a
-- client may already have downloaded and be acting on — the same
-- "snapshot, don't re-derive" reasoning Phase 8's
-- approve_material_request() idempotency design already used for a
-- different reason (replay safety). subtotal is stored alongside the
-- snapshot for the same reason, not recomputed from project_expenses on
-- every read.
--
-- LINE ITEM SOURCE — project_expenses only, not a separate materials
-- query. Confirmed via 0008/0073: an approved material request with a
-- cost pushes into project_expenses with category = 'materiaux'
-- (approve_material_request(), 0073) — so "line items from expenses/
-- materials" (plan's own §2.5 wording) is already fully satisfied by
-- reading project_expenses alone; a second query against materials would
-- double-count approved requests that already landed there.
-- -----------------------------------------------------------------------------

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  invoice_number text not null,
  issued_at     date not null default current_date,
  due_date      date not null,
  period_from   date not null,
  period_to     date not null,
  line_items    jsonb not null,   -- frozen snapshot: [{description, category, amount, expense_date}]
  subtotal      numeric(12, 2) not null,
  notes         text,
  created_by    uuid not null references profiles(id),
  created_at    timestamptz not null default now(),
  unique (org_id, invoice_number)
);

create index invoices_project_id_idx on invoices (project_id);
create index invoices_org_id_idx on invoices (org_id);

comment on table invoices is
  'Phase 9 §2.5 — client-facing invoice, frozen line_items/subtotal snapshot taken at generation time from project_expenses (see this migration''s Part 2 header for why it is a snapshot, not a live join). No payment-status tracking (paid/unpaid) — the plan''s own §2.5 text asks only for "a due date," not a payment ledger; adding one would be scope beyond what was asked.';

alter table invoices enable row level security;

create policy "invoices_select_owner_manager" on invoices
  for select using (org_role_of(org_id) in ('owner', 'manager'));
-- No client-facing select/insert policy: the anon client portal reads
-- invoices exclusively through verify_client_portal_access() below (a
-- SECURITY DEFINER function, bypasses RLS by construction), never a
-- direct table read — a client has no auth.uid() to check org
-- membership against in the first place.

create or replace function create_invoice(
  p_project_id  uuid,
  p_period_from date,
  p_period_to   date,
  p_due_date    date,
  p_notes       text default null
)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_line_items jsonb;
  v_subtotal numeric(12, 2);
  v_seq int;
  v_invoice_number text;
  v_invoice invoices;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if org_role_of(v_org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;
  if p_period_to < p_period_from then
    raise exception 'invalid_period';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'description', coalesce(pe.description, initcap(pe.category)),
           'category', pe.category,
           'amount', pe.amount,
           'expense_date', pe.expense_date
         ) order by pe.expense_date), '[]'::jsonb),
         coalesce(sum(pe.amount), 0)
    into v_line_items, v_subtotal
  from project_expenses pe
  where pe.project_id = p_project_id
    and pe.expense_date between p_period_from and p_period_to;

  -- Sequential per org per calendar month — same "count-based, not a
  -- separate sequence object" simplicity every other lightweight numbering
  -- need in this app already uses. Not atomic under true concurrent
  -- generation by the same org in the same second (a real but very
  -- unlikely race for a single-org, low-frequency action like this) —
  -- disclosed rather than silently assumed safe; a `unique (org_id,
  -- invoice_number)` constraint on the table means a genuine collision
  -- fails loudly (constraint violation) instead of silently overwriting.
  select count(*) + 1 into v_seq
  from invoices
  where org_id = v_org_id and to_char(issued_at, 'YYYYMM') = to_char(current_date, 'YYYYMM');
  v_invoice_number := 'FACT-' || to_char(current_date, 'YYYYMM') || '-' || lpad(v_seq::text, 3, '0');

  insert into invoices (org_id, project_id, invoice_number, due_date, period_from, period_to, line_items, subtotal, notes, created_by)
  values (v_org_id, p_project_id, v_invoice_number, p_due_date, p_period_from, p_period_to, v_line_items, v_subtotal, p_notes, auth.uid())
  returning * into v_invoice;

  return v_invoice;
end;
$$;

grant execute on function create_invoice(uuid, date, date, date, text) to authenticated;

comment on function create_invoice(uuid, date, date, date, text) is
  'Phase 9 §2.5 "Générer une facture." Owner/manager only, resolved from the project''s lead_org_id (never a trusted org_id parameter, same pattern as generate_client_portal_link). Snapshots project_expenses for the given period into line_items — see this migration''s Part 2 header for why a snapshot, not a live join.';

-- Anon-callable client-portal verification + view. Mirrors
-- get_worker_invitation_by_token (0017) / get_project_invitation_by_token
-- (0024)'s exact shape: SECURITY DEFINER, granted to anon, returns only
-- the fields the client-facing screen needs — never the full projects/
-- client_portals row.
--
-- PIN lockout mirrors the columns migration 0020 already reserved for
-- this exact purpose (failed_pin_attempts/locked_until, "5 failed
-- attempts locks 15 minutes" per that migration's own comment) — that
-- rule is IMPLEMENTED here for the first time, not re-designed.
create or replace function verify_client_portal_access(p_token text, p_pin text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal client_portals;
  v_project projects;
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
    -- Correct PIN resets the counter, same "success clears the failure
    -- streak" shape as every other attempt-limited flow in this app
    -- (e.g. mfa-recover).
    update client_portals set failed_pin_attempts = 0, locked_until = null where id = v_portal.id;
  end if;

  select * into v_project from projects where id = v_portal.project_id;

  -- Same computation dashboard.tsx's consumedTotal already uses
  -- (sum of project_expenses.amount, no category filter) — reused
  -- exactly, not re-derived a third way, per this phase's own Step 1
  -- instruction.
  select coalesce(sum(amount), 0) into v_consumed
  from project_expenses where project_id = v_project.id;

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
    'invoices', v_invoices
  );
end;
$$;

grant execute on function verify_client_portal_access(text, text) to anon;

comment on function verify_client_portal_access(text, text) is
  'Phase 9 §2.5 — anon-safe, token-scoped client-portal read, same shape as get_worker_invitation_by_token (0017). Implements the 5-attempts/15-minute PIN lockout migration 0020''s own comment reserved failed_pin_attempts/locked_until for, but never built until this phase.';

-- Anon-callable, token+PIN-scoped invoice PDF fetch needs the same
-- verification logic as the page load above, so the Edge Function that
-- serves the PDF (generate-invoice-pdf, this phase) can re-verify a
-- request that arrives without a live page session (e.g. a bookmarked
-- download link) without duplicating the PIN-check logic inline in Deno.
create or replace function verify_client_portal_invoice(p_token text, p_pin text, p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal client_portals;
  v_invoice invoices;
begin
  select * into v_portal from client_portals where link_token = p_token;
  if v_portal.id is null then
    raise exception 'not_found';
  end if;
  if v_portal.locked_until is not null and v_portal.locked_until > now() then
    raise exception 'locked';
  end if;
  if v_portal.pin_enabled then
    if p_pin is null or v_portal.pin_hash is null or crypt(p_pin, v_portal.pin_hash) <> v_portal.pin_hash then
      raise exception 'pin_required';
    end if;
  end if;

  select * into v_invoice from invoices where id = p_invoice_id and project_id = v_portal.project_id;
  if v_invoice.id is null then
    raise exception 'not_found';
  end if;

  return v_invoice;
end;
$$;

grant execute on function verify_client_portal_invoice(text, text, uuid) to anon;

comment on function verify_client_portal_invoice(text, text, uuid) is
  'Phase 9 §2.5 — re-verifies token+PIN for a single invoice download (generate-invoice-pdf Edge Function''s anon path), scoped to invoices belonging to the SAME project the token was generated for (p_invoice_id alone is not trusted). Deliberately does not touch failed_pin_attempts/locked_until a second time here — verify_client_portal_access already owns that bookkeeping for the page load that precedes any download link being clickable at all.';


-- -----------------------------------------------------------------------------
-- Part 3 — §2.8 In-app support/feedback
--
-- Grepped every migration for "feedback" before writing this (per this
-- phase's own Step 1 instruction) — confirmed no such table exists
-- anywhere in supabase/migrations/.
-- -----------------------------------------------------------------------------

create table feedback (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id) on delete cascade,
  submitted_by uuid not null references profiles(id),
  category     text not null default 'other' check (category in ('bug', 'suggestion', 'question', 'other')),
  message      text not null,
  platform     text,   -- e.g. 'mobile' — client-reported, not enforced server-side (same free-text shape send-organization-invitation-email's x-dala-platform header already uses)
  app_version  text,
  created_at   timestamptz not null default now()
);

create index feedback_org_id_idx on feedback (org_id);

comment on table feedback is
  'Phase 9 §2.8 "Signaler un problème." org_id nullable: a worker with no active org (rare, but not impossible mid-onboarding) can still submit feedback — this table intentionally does not gate submission on org membership the way every financial/operational table in this schema does, since feedback about the app itself is not org-scoped data.';

alter table feedback enable row level security;

-- Any authenticated user can submit their own feedback; nobody (not even
-- owner/manager) can read another person's submission through client-side
-- RLS — feedback is read by whoever operates this product (currently:
-- nobody in-app, follows up out of band), not surfaced back into the app
-- for other org members to browse. Matches the "Signaler un problème"
-- framing (a private report to the team, not a public org-visible log)
-- rather than assuming a read surface the plan never asked for.
create policy "feedback_insert_self" on feedback
  for insert with check (submitted_by = auth.uid());
create policy "feedback_select_self" on feedback
  for select using (submitted_by = auth.uid());
