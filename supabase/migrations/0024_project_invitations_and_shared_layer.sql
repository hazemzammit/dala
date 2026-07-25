-- =============================================================================
-- 0024_project_invitations_and_shared_layer.sql
-- Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.8, §2.8a
--
-- Phase 4 — multi-org collaboration. Three things happen in this file:
--
-- 1. `project_invitations` — did not exist anywhere in migrations 0001-0023.
--    Structurally mirrors `worker_invitations` (0004) + `invite_worker`
--    (0018) one level up: org-to-org instead of org-to-worker. See the
--    function comments below for where the shape deliberately differs
--    (an org invite must NOT bypass password-based account creation the way
--    accept-worker-invitation does, per Doc 02 §2.8's explicit "the invite
--    doesn't bypass sign-up, it just pre-fills organization context").
--
-- 2. `report_branding_opt_out` on `project_memberships` — Doc 02 §2.8's
--    report-branding flag. `budget_rollup_opt_in` (the OTHER flag Doc 02
--    §2.8 describes) already exists on this table as of 0006_projects_
--    dispatch_vehicles.sql ("Doc 00 §0.5 item 3, off by default") — Doc 02's
--    prose calls it `budget_shared`, but it's the same field under the name
--    actually used in the schema and in packages/shared-types. Confirmed by
--    reading 0006 and shared-types/index.ts directly before writing this
--    file; NOT re-added here under a second name.
--
-- 3. Shared-layer RLS on `site_logs` — Doc 02 §2.8's three-layer visibility
--    model (Private/Shared/Client) has no RLS implementation at all today:
--    every Phase-1-3 table (materials, site_logs, safety_incidents,
--    org_insurances) is org-only (`is_org_member(org_id)`), full stop. Doc
--    02's own example rows for the Shared layer are "Task list" and
--    "Comment thread" — neither exists as a table anywhere in this schema,
--    so they can't be wired up; there is nothing to attach a policy to.
--    `site_logs` (the project photo/journal timeline, Doc 02 §2.5) is the
--    one Shared-layer-shaped artifact that actually exists, so it's what
--    this migration wires as the concrete Shared-layer implementation for
--    Phase 4. This is an ADDITIVE policy (Postgres OR's multiple permissive
--    SELECT policies together) — the existing org-only
--    "site_logs_select_member" policy from 0008 is untouched.
--
--    KNOWN GAP, documented rather than silently left half-working: this
--    only opens the `site_logs` ROW to cross-org project members. The
--    linked photo/voice files live in the `org-files` Storage bucket
--    (0020) under a `{org_id}/{category}/{filename}` path, gated by
--    `is_org_participant(org_id)` — same-org or that org's own worker only.
--    A cross-org project member can now see that a shared log entry
--    exists and read its caption/text, but the photo/voice attachment
--    itself will 403 for them, because the storage path has no project_id
--    segment to check against. Fixing that needs a path-convention change
--    (or a project_id-aware storage policy) that's a bigger change than
--    fits in this pass — flagging it here rather than shipping a feature
--    that looks done in the UI and silently fails on the attachment.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — project_invitations
-- ---------------------------------------------------------------------------

create table project_invitations (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  lead_org_id     uuid not null references organizations(id) on delete cascade,
  invited_org_id  uuid references organizations(id),  -- set once accepted
  invited_phone   text,
  invited_email   text,
  trade_type      text,
  token           text not null unique,
  sent_via        text not null check (sent_via in ('whatsapp', 'sms', 'email')),
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  created_by      uuid not null references profiles(id),
  sent_at         timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_at     timestamptz,
  constraint project_invitations_contact_required
    check (invited_phone is not null or invited_email is not null)
);

create index project_invitations_project_id_idx on project_invitations (project_id);
create index project_invitations_lead_org_id_idx on project_invitations (lead_org_id);

alter table project_invitations enable row level security;

-- Lead org's own outbox only. The invited party never reads this table
-- directly before accepting — same as worker_invitations, the pre-account
-- lookup goes through the anon-safe SECURITY DEFINER function below, and
-- an already-accounted invited org accepts via the SECURITY DEFINER RPC,
-- neither of which needs a SELECT policy granting them table access.
create policy "project_invitations_select_lead" on project_invitations
  for select using (is_org_member(lead_org_id));

-- No direct client INSERT policy needed beyond what invite_org_to_project
-- (SECURITY INVOKER, below) requires to succeed as the calling user.
create policy "project_invitations_insert_lead" on project_invitations
  for insert with check (org_role_of(lead_org_id) in ('owner', 'manager'));

-- ---------------------------------------------------------------------------
-- Part 2 — report_branding_opt_out on project_memberships
-- ---------------------------------------------------------------------------

alter table project_memberships
  add column report_branding_opt_out boolean not null default false;

comment on column project_memberships.report_branding_opt_out is
  'Doc 02 §2.8 report branding — a trade org opts OUT of its secondary '
  'attribution line ("Plomberie par [Trade Org Name]") on a lead org''s '
  'cross-trade report. Default false (attributed by default). Actual report '
  '/ PDF rendering is a web export concern (same scope boundary as Phase 3''s '
  'PDF-export cut) — this column is the flag a mobile screen can read/write; '
  'no mobile screen renders the report itself.';

-- ---------------------------------------------------------------------------
-- Part 3 — invite_org_to_project RPC
-- ---------------------------------------------------------------------------
--
-- Same reasoning as invite_worker (0018): a client-generated token is a
-- bearer credential for creating a project_memberships row (and, via
-- sign-up, an organization) — generate it server-side with gen_random_uuid(),
-- never trust one supplied by the client.
--
-- SECURITY INVOKER (default, not stated explicitly) — same as invite_worker:
-- this does the upsert convenience, not a permission bypass, so RLS still
-- applies to the INSERT/UPDATE it performs.
create or replace function invite_org_to_project(
  p_project_id uuid,
  p_invited_phone text,
  p_invited_email text,
  p_trade_type text,
  p_sent_via text
)
returns uuid language plpgsql as $$
declare
  v_lead_org_id uuid;
  v_existing_id uuid;
  v_invitation_id uuid;
begin
  select lead_org_id into v_lead_org_id from projects where id = p_project_id;
  if v_lead_org_id is null then
    raise exception 'project_not_found';
  end if;

  if org_role_of(v_lead_org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if p_invited_phone is null and p_invited_email is null then
    raise exception 'contact_required';
  end if;

  -- Dedup: re-inviting the same contact on the same project updates the
  -- existing pending row (fresh token/expiry) instead of creating a
  -- duplicate — same rule as invite_worker's re-invite behavior.
  select id into v_existing_id
  from project_invitations
  where project_id = p_project_id
    and status = 'pending'
    and (
      (p_invited_phone is not null and invited_phone = p_invited_phone)
      or (p_invited_email is not null and lower(invited_email) = lower(p_invited_email))
    )
  order by sent_at desc
  limit 1;

  if v_existing_id is not null then
    update project_invitations
    set token = gen_random_uuid()::text,
        trade_type = p_trade_type,
        sent_via = p_sent_via,
        sent_at = now(),
        expires_at = now() + interval '7 days'
    where id = v_existing_id
    returning id into v_invitation_id;
  else
    insert into project_invitations (
      project_id, lead_org_id, invited_phone, invited_email, trade_type,
      token, sent_via, created_by
    )
    values (
      p_project_id, v_lead_org_id, p_invited_phone, p_invited_email, p_trade_type,
      gen_random_uuid()::text, p_sent_via, auth.uid()
    )
    returning id into v_invitation_id;
  end if;

  return v_invitation_id;
end;
$$;

grant execute on function invite_org_to_project(uuid, text, text, text, text) to authenticated;

comment on function invite_org_to_project(uuid, text, text, text, text) is
  'Doc 02 §2.8 — lead org invites a trade org onto a project by phone or '
  'email. Generates the project_invitations token server-side, mirroring '
  'invite_worker (0018). Upserts by (project_id, contact) so a re-invite '
  'updates the existing pending row.';

-- ---------------------------------------------------------------------------
-- Part 4 — anon-safe token lookup, for the accept-org-invite screen
-- ---------------------------------------------------------------------------
--
-- Deliberately does NOT try to tell the caller whether the invited contact
-- already has an account — that would mean looking up a phone/email against
-- profiles and returning a hit/miss to an anonymous caller, which leaks
-- account-existence for a phone/email pair. The accept screen instead shows
-- both "J'ai déjà un compte" and "Créer un compte" and lets the person
-- self-select — no lookup, no leak.
create or replace function get_project_invitation_by_token(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'project_id', pi.project_id,
    'project_name', p.name,
    'lead_org_name', o.name,
    'trade_type', pi.trade_type,
    'status', pi.status,
    'expired', pi.expires_at < now()
  )
  from project_invitations pi
  join projects p on p.id = pi.project_id
  join organizations o on o.id = pi.lead_org_id
  where pi.token = p_token;
$$;

grant execute on function get_project_invitation_by_token(text) to anon;

comment on function get_project_invitation_by_token(text) is
  'Anon-safe, token-scoped lookup for the org-to-org accept-invite screen, '
  'which may run before the invited party has any session at all. Mirrors '
  'get_worker_invitation_by_token (0017).';

-- ---------------------------------------------------------------------------
-- Part 5 — accept_project_invitation RPC (existing-account path)
-- ---------------------------------------------------------------------------
--
-- Used when the invited org ALREADY has an account and is logged in when
-- they tap the invite link. The no-account path does NOT use this function
-- — it goes through the standard sign-up Edge Function instead (see that
-- function's own comment for why), which does the equivalent insert with
-- the service role once the new organization exists.
--
-- SECURITY DEFINER is required here (unlike invite_org_to_project): before
-- this call, the accepting user is not yet a member of project_memberships
-- for this project, so no ordinary RLS policy would let them write that
-- first row — same shape of problem create_organization_for_current_user
-- (0014) solves for org creation. auth.uid() is read explicitly inside the
-- function body, never trusted from a parameter, so a caller can only ever
-- accept on behalf of their OWN current active org.
create or replace function accept_project_invitation(
  p_token text,
  p_budget_rollup_opt_in boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_invitation project_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select * into v_invitation from project_invitations where token = p_token;
  if v_invitation.id is null then
    raise exception 'invitation_not_found';
  end if;
  if v_invitation.status = 'accepted' then
    raise exception 'already_accepted';
  end if;
  if v_invitation.expires_at < now() then
    raise exception 'expired';
  end if;

  select active_org_id into v_org_id from profiles where id = v_user_id;
  if v_org_id is null then
    raise exception 'no_active_organization';
  end if;
  if org_role_of(v_org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  insert into project_memberships (project_id, org_id, role, budget_rollup_opt_in)
  values (v_invitation.project_id, v_org_id, 'trade', p_budget_rollup_opt_in)
  on conflict (project_id, org_id)
  do update set budget_rollup_opt_in = excluded.budget_rollup_opt_in;

  update project_invitations
  set status = 'accepted', accepted_at = now(), invited_org_id = v_org_id
  where id = v_invitation.id;

  return v_invitation.project_id;
end;
$$;

grant execute on function accept_project_invitation(text, boolean) to authenticated;

comment on function accept_project_invitation(text, boolean) is
  'Doc 02 §2.8 — existing-account path of the org-to-org invite accept flow. '
  'Activates project_memberships(role=''trade'') for the CURRENT user''s '
  'active org, carrying the budget-rollup opt-in checkbox shown at accept '
  'time. The no-account path is handled in supabase/functions/sign-up '
  'instead (service role, run right after the new organization is created).';

-- ---------------------------------------------------------------------------
-- Part 6 — Shared-layer RLS on site_logs (see file header, Part 3)
-- ---------------------------------------------------------------------------

create policy "site_logs_select_project_shared" on site_logs
  for select using (is_project_member(project_id));

comment on policy "site_logs_select_project_shared" on site_logs is
  'Doc 02 §2.8 Shared layer — a project member from ANY org on the project '
  '(not just the org that wrote the entry) can read site_logs rows. '
  'Additive to site_logs_select_member (0008); Postgres ORs permissive '
  'SELECT policies together, so own-org access is unaffected. See this '
  'migration''s file header for the Storage-bucket gap this does not close.';
