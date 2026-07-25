-- =============================================================================
-- 0020_field_ops_worker_self_access_and_client_portal.sql
-- Ref: docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.4, §2.5, §2.6, §2.7
-- Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.15-§3.18, §4.2, §4.3
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.5, §1.9, §1.11
--
-- *** Fixes real, pre-existing gaps in migration 0008, not just new Phase 3
-- scope — same bug class migration 0019 fixed for advances/attendance. ***
--
-- Gap 1 — materials: `materials_write_owner_manager` (`for all`, owner/
-- manager only) and `materials_select_member` (`is_org_member`-gated) meant
-- a worker could never submit a material request (§4.3) or read back their
-- own request's status history — the exact same "worker isn't an
-- organization_members row" bug 0019 fixed for advances/attendance/dispatch.
-- Unlike advances, a material request doesn't need a security-definer RPC:
-- Doc 01 §1.9.1 explicitly lists "material requests" as one of the
-- append-only tables whose offline-conflict story is "always an INSERT,
-- never an UPDATE" — there's no worker-identity-resolution subtlety an RPC
-- would need to protect here that a plain `with check` can't already cover
-- (materials.created_by is a `profiles(id)` FK, and `profiles.id = auth.uid()`
-- for the row's own owner — see migration 0002 — so `created_by = auth.uid()`
-- is a direct, correct predicate, not a JWT-claim shortcut).
--
-- Gap 2 — site_logs: same `is_org_member`-gated insert policy blocks a
-- worker's Update Chantier submit (§4.2), AND `photo_url` is `not null`
-- even though the spec requires "at least one of photo/voice/text," AND
-- there is no `idempotency_key` column despite §4.2 explicitly requiring
-- idempotent submission (Doc 01 §1.11's mechanism, applied here even though
-- site logs aren't a "money-moving" table — the retried-request problem
-- §1.11.2 describes is identical for a flaky-connection photo upload).
-- Fixed by: making photo_url nullable, adding voice_note_url/note_text/
-- thumbnail_url/idempotency_key/location_lat/location_lng, a check
-- constraint enforcing "at least one of the three content fields," and a
-- security-definer RPC (submit_site_log_entry) that owns the idempotency
-- replay logic — mirroring 0019's create_advance/request_advance shape.
-- The existing is_org_member-gated direct-insert policy is left in place
-- (not removed) for the org-member upload path Doc 02 §2.5 describes for
-- web ("uploading photos from disk") — this migration only ADDS a worker
-- path, it doesn't take anything away from the existing one.
--
-- Gap 3 — safety_incidents has no column and no join table for "involved
-- worker multi-select," which Doc 03 §3.17 explicitly specs, and no
-- `location` text field despite the same section listing "date, location,
-- description..." as the incident's fields. Fixed with a new
-- safety_incident_workers join table and an added location column.
--
-- Gap 4 — org_insurances is missing `coverage_type` and the "auto-reminder
-- 30 days before expiry, on by default" toggle (§3.17) entirely — neither
-- field exists in migration 0008. Added below.
--
-- Gap 5 — no `client_portal` table exists in any migration up to this
-- point, despite Doc 02 §2.7 and Doc 03 §3.18 fully specifying one. Added
-- below, together with the RPCs a contractor's mobile management screen
-- needs (generate link, set/reset PIN, disable PIN).
--
-- ** IMPORTANT CAVEAT, flagged rather than glossed over **: Doc 02 §2.7
-- says "PIN hashed with Argon2id before storage." Vanilla Postgres/pgcrypto
-- (the only extension already enabled in this project, migration 0001) has
-- no Argon2id — it ships bcrypt/blowfish via `crypt()`/`gen_salt('bf')`.
-- True Argon2id would mean a Deno Edge Function (there's an argon2 library
-- for Deno) fronting this table instead of a plain SQL RPC. That Edge
-- Function would also be the natural home for the *client-facing* PIN
-- verification endpoint — which is web/portal territory, out of scope for
-- a mobile-only pass, and not something to design unilaterally without
-- whoever ends up building that verification flow. Given the brief itself
-- flags client-portal as "the item to defer if time is short," the
-- pragmatic middle ground taken here: build the real schema + a fully
-- working contractor-side management screen now (so the feature isn't
-- silently dropped), but hash with bcrypt via pgcrypto rather than
-- inventing a shared Edge Function ahead of the team that will consume it.
-- bcrypt is still a legitimate slow, salted password-hashing KDF (not a
-- naive digest) — this is a deliberate interim substitution, not a
-- security shortcut, and it's called out again in the delivery guide.
--
-- Gap 6 — no Supabase Storage bucket exists ANYWHERE in this repo's
-- migrations. Every `*_url` column added since migration 0004 (avatars,
-- receipts, and now site-log/safety photos) has had nowhere to actually
-- put a file. This isn't Phase-3-specific — it silently blocked photo
-- upload for Phase 1/2 screens too, they just never got far enough to
-- need it. Fixed with a single shared `org-files` bucket, path-scoped as
-- `{org_id}/{...}` so one bucket (simpler to reason about against the
-- per-org 1GB quota, Doc 01 §1.6) works for every upload use case rather
-- than one bucket per feature.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — materials: worker-self RLS
-- ---------------------------------------------------------------------------

-- Réassigner (§3.15) needs somewhere to point a request at a *different*
-- worker than whoever originally requested it (materials.created_by),
-- without overwriting who actually asked — so this is a second, nullable
-- column, not a repurposing of created_by.
alter table materials add column assigned_worker_id uuid references workers(id);

create policy "materials_select_self" on materials
  for select using (created_by = auth.uid());

-- A worker may only ever insert a row attributed to themselves, always
-- 'pending' (approve/reject/reassign stay owner/manager-only via the
-- existing materials_write_owner_manager policy), and scoped to their own
-- org — checked here by a direct subquery on workers, the same
-- inline-subselect shape migration 0005 already uses for
-- worker_invitations' policies, rather than introducing a new named
-- predicate function for a single call site.
create policy "materials_insert_self" on materials
  for insert with check (
    created_by = auth.uid()
    and status = 'pending'
    and org_id = (select org_id from workers where workers.user_id = auth.uid())
  );

comment on column materials.assigned_worker_id is
  'Doc 03 §3.15 "Réassigner" — who the request is now routed to, independent of created_by (who originally asked). Null until a contractor reassigns it.';

-- ---------------------------------------------------------------------------
-- Part 2 — site_logs: schema fixes + worker-self idempotent RPC
-- ---------------------------------------------------------------------------

alter table site_logs alter column photo_url drop not null;
alter table site_logs add column voice_note_url text;
alter table site_logs add column note_text text;
alter table site_logs add column thumbnail_url text;
alter table site_logs add column idempotency_key uuid unique;
alter table site_logs add column location_lat numeric(9, 6);
alter table site_logs add column location_lng numeric(9, 6);

alter table site_logs add constraint site_logs_at_least_one_field check (
  photo_url is not null or voice_note_url is not null or note_text is not null
);

comment on column site_logs.idempotency_key is
  'Doc 01 §1.11 / Doc 03 §4.2 — set only on worker-submitted entries via submit_site_log_entry(); null for the pre-existing org-member direct-insert path, which has no retry-duplication risk worth gating (a contractor uploading from a desk browser doesn''t hit the flaky-mobile-connection scenario this protects against).';
comment on column site_logs.location_lat is
  'Doc 03 §3.16 "GPS-stripped location tag if captured" — a separate, deliberately captured coordinate, NOT read back out of the photo''s EXIF (which is stripped, Doc 01 §1.3.11). Null whenever location permission was denied or the worker declined — never silently required, same principle as the check-in flow (Doc 03 §4.1 edge cases).';

create policy "site_logs_select_self" on site_logs
  for select using (
    exists (select 1 from workers where workers.org_id = site_logs.org_id and workers.user_id = auth.uid())
  );

create or replace function submit_site_log_entry(
  p_project_id uuid,
  p_photo_url text,
  p_voice_note_url text,
  p_note_text text,
  p_thumbnail_url text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_idempotency_key uuid
)
returns site_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker workers;
  v_request_hash text;
  v_existing idempotency_keys;
  v_log site_logs;
begin
  select * into v_worker from workers where user_id = auth.uid();
  if not found then
    raise exception 'no_worker_record_for_current_user';
  end if;

  if p_photo_url is null and p_voice_note_url is null and (p_note_text is null or length(trim(p_note_text)) = 0) then
    raise exception 'at_least_one_field_required';
  end if;

  -- The project has to actually belong to the worker's own org — a plain
  -- client-supplied project_id would otherwise let a compromised/buggy
  -- client attribute a log entry to a project outside the worker's org.
  if not exists (select 1 from projects where id = p_project_id and lead_org_id = v_worker.org_id) then
    raise exception 'project_not_in_worker_org';
  end if;

  v_request_hash := md5(
    coalesce(v_worker.id::text, '') || '|' ||
    coalesce(p_project_id::text, '') || '|' ||
    coalesce(p_photo_url, '') || '|' ||
    coalesce(p_voice_note_url, '') || '|' ||
    coalesce(p_note_text, '')
  );

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_log from site_logs where id = (v_existing.response_body ->> 'id')::uuid;
    return v_log;
  end if;

  insert into site_logs (
    org_id, project_id, photo_url, voice_note_url, note_text, thumbnail_url,
    location_lat, location_lng, logged_by, idempotency_key
  )
  values (
    v_worker.org_id, p_project_id, p_photo_url, p_voice_note_url, p_note_text, p_thumbnail_url,
    p_location_lat, p_location_lng, auth.uid(), p_idempotency_key
  )
  returning * into v_log;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_worker.org_id, 'submit_site_log_entry', v_request_hash, 200, jsonb_build_object('id', v_log.id));

  return v_log;
end;
$$;

grant execute on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid) to authenticated;

comment on function submit_site_log_entry(uuid, text, text, text, text, numeric, numeric, uuid) is
  'Doc 03 §4.2 — worker Update Chantier submit. Resolves the worker server-side from workers.user_id=auth.uid() (never trusted as a parameter), validates the target project belongs to the worker''s own org, and replays the cached row on a retried idempotency key rather than re-inserting — same contract as migration 0019''s request_advance.';

-- ---------------------------------------------------------------------------
-- Part 3 — safety_incidents: location field + involved-worker join table
-- ---------------------------------------------------------------------------

alter table safety_incidents add column location text;

create table safety_incident_workers (
  incident_id uuid not null references safety_incidents(id) on delete cascade,
  worker_id   uuid not null references workers(id) on delete cascade,
  primary key (incident_id, worker_id)
);

comment on table safety_incident_workers is
  'Doc 03 §3.17 "involved worker multi-select" — many-to-many, a separate table rather than an array column so each worker row stays a real FK (referential integrity if a worker is later deleted) instead of a loose uuid[] that migration 0008 has no equivalent pattern for elsewhere.';

alter table safety_incident_workers enable row level security;

create policy "safety_incident_workers_select_member" on safety_incident_workers
  for select using (
    is_org_member((select org_id from safety_incidents where safety_incidents.id = safety_incident_workers.incident_id))
  );
create policy "safety_incident_workers_write_owner_manager" on safety_incident_workers
  for all using (
    org_role_of((select org_id from safety_incidents where safety_incidents.id = safety_incident_workers.incident_id)) in ('owner', 'manager')
  );

-- ---------------------------------------------------------------------------
-- Part 4 — org_insurances: missing fields from Doc 03 §3.17
-- ---------------------------------------------------------------------------

alter table org_insurances add column coverage_type text;
alter table org_insurances add column reminder_enabled boolean not null default true;

comment on column org_insurances.reminder_enabled is
  'Doc 03 §3.17 "auto-reminder 30 days before expiry (toggle, on by default)." The actual reminder DISPATCH (a scheduled job checking expires_at - 30d against today) is not implemented by this migration — Doc 01 §1.6 lists send_payment_reminders/weekly_salary_summaries as existing scheduled jobs but no insurance-expiry job exists yet in supabase/migrations. This column makes the toggle persist correctly; wiring an actual notification job is separate follow-up work, noted in the delivery guide rather than silently assumed to already happen.';

-- ---------------------------------------------------------------------------
-- Part 5 — client_portal
-- ---------------------------------------------------------------------------

create table client_portals (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  project_id            uuid not null references projects(id) on delete cascade,
  link_token            text not null unique,
  pin_enabled           boolean not null default false,
  pin_hash              text,                 -- bcrypt via pgcrypto — see migration header caveat re: Argon2id
  failed_pin_attempts   integer not null default 0,
  locked_until          timestamptz,
  last_reset_at         timestamptz,
  last_reset_by         uuid references profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (project_id)
);

create trigger client_portals_set_updated_at
  before update on client_portals
  for each row execute function set_updated_at();

comment on table client_portals is
  'Doc 02 §2.7 / Doc 03 §3.18. failed_pin_attempts/locked_until implement the "5 failed attempts locks 15 minutes" rule from the CLIENT-facing verification side — that verification endpoint itself is web/portal scope (out of bounds here, see migration header), but the columns it will need to read/write are created now so that work isn''t blocked on a follow-up migration.';

alter table client_portals enable row level security;

create policy "client_portals_select_owner_manager" on client_portals
  for select using (org_role_of(org_id) in ('owner', 'manager'));
create policy "client_portals_write_owner_manager" on client_portals
  for all using (org_role_of(org_id) in ('owner', 'manager'));

create or replace function generate_client_portal_link(p_project_id uuid)
returns client_portals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if org_role_of(v_org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  -- "Générer un lien client" (§3.18) regenerates the token every time it's
  -- tapped, including on an existing portal row — an old shared link
  -- should stop working once a fresh one is generated, same reasoning as
  -- rotating any other access token.
  insert into client_portals (org_id, project_id, link_token)
  values (v_org_id, p_project_id, encode(gen_random_bytes(16), 'hex'))
  on conflict (project_id) do update
    set link_token = encode(gen_random_bytes(16), 'hex'),
        updated_at = now()
  returning * into v_portal;

  return v_portal;
end;
$$;

grant execute on function generate_client_portal_link(uuid) to authenticated;

create or replace function set_client_portal_pin(p_project_id uuid, p_pin text)
returns client_portals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if org_role_of(v_org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin_format';
  end if;

  -- Doubles as "Réinitialiser le PIN du client" (§3.18) — setting a new PIN
  -- IS the reset; there's no separate reset mechanism to keep in sync.
  insert into client_portals (org_id, project_id, link_token, pin_enabled, pin_hash, failed_pin_attempts, locked_until, last_reset_at, last_reset_by)
  values (v_org_id, p_project_id, encode(gen_random_bytes(16), 'hex'), true, crypt(p_pin, gen_salt('bf')), 0, null, now(), auth.uid())
  on conflict (project_id) do update
    set pin_enabled = true,
        pin_hash = crypt(p_pin, gen_salt('bf')),
        failed_pin_attempts = 0,
        locked_until = null,
        last_reset_at = now(),
        last_reset_by = auth.uid(),
        updated_at = now()
  returning * into v_portal;

  return v_portal;
end;
$$;

grant execute on function set_client_portal_pin(uuid, text) to authenticated;

create or replace function disable_client_portal_pin(p_project_id uuid)
returns client_portals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select org_id into v_org_id from client_portals where project_id = p_project_id;
  if v_org_id is null then
    raise exception 'portal_not_found';
  end if;
  if org_role_of(v_org_id) not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  update client_portals
  set pin_enabled = false, pin_hash = null, failed_pin_attempts = 0, locked_until = null, updated_at = now()
  where project_id = p_project_id
  returning * into v_portal;

  return v_portal;
end;
$$;

grant execute on function disable_client_portal_pin(uuid) to authenticated;

comment on function generate_client_portal_link(uuid) is
  'Doc 03 §3.18 "Générer un lien client." Owner/manager only, resolved from the project''s lead_org_id — no org_id trusted as a client parameter.';
comment on function set_client_portal_pin(uuid, text) is
  'Doc 03 §3.18 PIN field + "Réinitialiser le PIN du client." Owner/manager only. Hashed with bcrypt via pgcrypto (see migration header re: Argon2id caveat) — plaintext PIN never stored, never returned.';
comment on function disable_client_portal_pin(uuid) is
  'Turns off "Protéger par code PIN" — clears the hash entirely rather than just flipping pin_enabled, so a disabled-then-re-enabled portal never silently reuses an old PIN''s hash.';

-- ---------------------------------------------------------------------------
-- Part 6 — org-files Storage bucket (did not exist anywhere before this)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('org-files', 'org-files', false)
on conflict (id) do nothing;

-- Same "is this a worker or an org member" shape as materials/site_logs
-- above, but needed again here for storage.objects specifically — factored
-- into its own named predicate function (per Doc 01 §1.5's "never a
-- hand-rolled check, always a table-lookup function" rule) rather than
-- inlined a third time, since it's the exact same logical OR either way.
create or replace function is_org_participant(target_org uuid)
returns boolean language sql stable as $$
  select is_org_member(target_org) or exists (
    select 1 from workers where org_id = target_org and user_id = auth.uid()
  );
$$;

comment on function is_org_participant(uuid) is
  'RLS predicate: is the current user EITHER an organization_members row OR a linked workers row for this org? Needed anywhere both contractors and workers write to the same resource (site-log/safety photo uploads) — is_org_member() alone rejects a worker session, is_own_worker() alone rejects a contractor session.';

-- Path convention: {org_id}/{category}/{filename} — e.g.
-- '3f2a.../site-logs/9c1b....jpg'. storage.foldername(name) returns the
-- path segments as a text[]; index [1] is always the org_id segment.
create policy "org_files_select_participant" on storage.objects
  for select using (bucket_id = 'org-files' and is_org_participant((storage.foldername(name))[1]::uuid));

create policy "org_files_insert_participant" on storage.objects
  for insert with check (bucket_id = 'org-files' and is_org_participant((storage.foldername(name))[1]::uuid));

create policy "org_files_delete_owner_manager" on storage.objects
  for delete using (bucket_id = 'org-files' and org_role_of((storage.foldername(name))[1]::uuid) in ('owner', 'manager'));
