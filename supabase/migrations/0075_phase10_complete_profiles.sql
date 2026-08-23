-- =============================================================================
-- 0075_phase10_complete_profiles.sql
-- Improvement-plan §11 "Phase 10 — Complete profiles", §4.2/§4.3/§4.4.
--
-- Baseline confirmed by reading each table directly before writing anything
-- here (not trusting the plan doc's own "checked against the schema" note a
-- second time, per this phase's own Step 1 instruction):
--   - organizations (0003): contact_phone/address/matricule_fiscal/
--     contact_email DO already exist, exactly as the plan claims. The six
--     fields below (legal_form, workforce_size_bracket, facebook_url,
--     instagram_url, website_url, service_area, rib, verification_status)
--     genuinely do not.
--   - workers (0004, +0017 email, +0025 deleted_at, +0070 photo_url): no
--     job_title/hire_date column exists.
--   - profiles (0002): profile_checklist_dismissed_at/email_verified_at/
--     last_login_at/last_login_platform already exist and are confirmed
--     dormant (grepped every screen/RPC — zero consumers beyond
--     shared-types and the admin users table, which reads/writes
--     last_login_at for its OWN unrelated purpose, not this feature).
--     emergency_contact_name/emergency_contact_phone are new.
--
-- RIB ENCRYPTION DECISION — read this before touching the rib column.
-- The plan's own wording assumes a "CIN was flagged for Vault-backed
-- encryption but deliberately left unencrypted pending production launch"
-- precedent to weigh against. That precedent doesn't actually exist in
-- this codebase: migration 0023's own header says plainly "there is no
-- `cin` column and no prior Vault usage to mirror... this migration is the
-- first real implementation of [the Vault-backed encryption] pattern in
-- this repo" — confirmed by reading 0021 and 0023 in full, not assumed.
-- CIN was never built at all (and stays out of scope — §12 explicitly
-- excludes it). So the real, working precedent in this codebase is 0023's
-- FUNCTIONING Vault-backed encryption for platform_admins.totp_secret, via
-- pgcrypto's pgp_sym_encrypt/pgp_sym_decrypt with a key held in
-- vault.decrypted_secrets — not a "flag now, encrypt later" placeholder.
--
-- Decision: real encryption now, not deferred. Two reasons: (1) there is
-- no actual "flag and defer" precedent to follow here — the only
-- precedent that exists is a working one; (2) client-facing invoicing
-- shipped in Phase 9 (generate-invoice-pdf, migration 0074), so RIB is no
-- longer a speculative future need — it is, from this migration forward,
-- real banking data an org enters so it can eventually get paid. One
-- further adaptation from 0023's own shape: 0023's TOTP secret is only
-- ever touched by apps/admin's trusted Next.js server code, so its
-- encrypt/decrypt happens at the Node application layer, with Postgres
-- only handing back the raw key. RIB is written directly from the mobile
-- client (Deno/React Native, no trusted Node server sits in front of it),
-- so encryption has to happen IN Postgres, inside a security definer RPC
-- — the RPC is the trust boundary here, the way it is for update_
-- organization_profile's owner-only column check. See Part 3 below.
--
-- Migration numbering: highest existing is 0074 (Phase 9's own), confirmed
-- by listing supabase/migrations/ before writing this file. This is 0075.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — organizations: five plain new fields (§4.2), verification_status
-- ---------------------------------------------------------------------------
-- No RLS change needed for any of these six columns: organizations_update_
-- owner_manager (0005) is a row-level `for all`/`for update` policy with no
-- column restriction, so a new column is automatically covered — same
-- reasoning already used for vehicles.version (0046) and every Phase 3/4/8
-- new column on an existing `for all`-policied table.

alter table organizations add column legal_form text
  check (legal_form in ('personne_physique', 'sarl', 'suarl', 'sa'));

comment on column organizations.legal_form is
  'Plan §4.2. Tunisian legal structure. No default — a pre-existing org has
   never declared one; NULL renders as "Non renseigné," not a guessed value.';

alter table organizations add column workforce_size_bracket text
  check (workforce_size_bracket in ('1', '2_10', '11_50', '51_plus'));

comment on column organizations.workforce_size_bracket is
  'Plan §4.2 — self-declared bracket at onboarding, SUPERSEDED for display
   by a live count from workers once workers exist for the org (see
   organization-settings.tsx''s own display logic, which reuses team.tsx''s
   active_workers-view count rather than a second computation — Step 1''s
   own instruction). This column stays as the pre-population fallback for
   an org with zero workers yet, and is never silently overwritten by the
   live count — the live count is a DISPLAY override, not a write-back.';

alter table organizations add column facebook_url text;
alter table organizations add column instagram_url text;
alter table organizations add column website_url text;

comment on column organizations.facebook_url is
  'Plan §4.2 — "Facebook/Instagram matter more than a website for Tunisian
   trades," per the plan''s own framing. Plain nullable text, no format
   validation beyond the existing z.string().url().optional() in the
   updated updateOrganizationSchema (packages/validation/src/organizations.ts)
   — same looseness already applied to logo_url/avatar_url before those
   were found to need the bare-path fix, but these three ARE meant to hold
   real external URLs (a Facebook page, not a Storage path), so .url() is
   correct here, not a repeat of that earlier bug.';

alter table organizations add column service_area text;

comment on column organizations.service_area is
  'Plan §4.2 "zone d''intervention" — free text (e.g. "Grand Tunis," "Nabeul
   et environs"), not a geocoded region. No structured service-area table
   exists anywhere in this schema and building one is scope beyond "add a
   profile field."';

alter table organizations add column verification_status text
  not null default 'unverified'
  check (verification_status in ('unverified', 'pending', 'verified'));

comment on column organizations.verification_status is
  'Plan §4.2, explicitly "low priority" within this item, per the plan''s
   own ordering. Column added and DISPLAYED (organization-settings.tsx
   shows a badge) but has NO org-self-service write path in this phase —
   an org declaring itself "verified" would be a self-attestation with no
   actual verification behind it, which is a materially different and
   larger feature (matricule_fiscal cross-checked against something, a
   platform-admin review queue, etc.) than "add a profile field." Stays
   ''unverified'' for every org until a future phase builds the actual
   verification mechanism (almost certainly an apps/admin surface, not a
   mobile-client-writable column) — disclosed here rather than silently
   building a fake toggle that looks like real verification.';

-- Write path for the five plain new fields above (everything except RIB,
-- which gets its own dedicated RPC in Part 2 below since it needs
-- encryption and an owner-only check different from these five). Kept
-- SEPARATE from update_organization_profile (0028) rather than widening
-- that function's 9-argument signature — same "don't touch a working
-- signature" reasoning Phase 2's migration 0069 used for
-- submit_site_log_entry. Owner OR manager, matching every other org-
-- profile-field write in this schema (organizations_update_owner_manager,
-- 0005) — none of these five is owner-only the way matricule_fiscal/
-- rc_number/rib are.
create or replace function update_organization_extended_profile(
  p_org_id uuid,
  p_legal_form text,
  p_workforce_size_bracket text,
  p_facebook_url text,
  p_instagram_url text,
  p_website_url text,
  p_service_area text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if org_role_of(p_org_id) not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update organizations set
    legal_form = p_legal_form,
    workforce_size_bracket = p_workforce_size_bracket,
    facebook_url = p_facebook_url,
    instagram_url = p_instagram_url,
    website_url = p_website_url,
    service_area = p_service_area
  where id = p_org_id;
end;
$$;

comment on function update_organization_extended_profile(uuid, text, text, text, text, text, text) is
  'Phase 10 §4.2 — the five new org fields that aren''t RIB. Owner or
   manager, matching organizations_update_owner_manager (0005); RIB gets
   its own owner-only RPC (update_organization_rib, below) since it needs
   encryption AND a stricter role check than these five.';

grant execute on function update_organization_extended_profile(uuid, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 2 — organizations.rib: encrypted-at-rest storage, per the RIB
-- decision documented in this file's own header above.
-- ---------------------------------------------------------------------------
-- Two columns, not one: `rib_encrypted` (the pgp_sym_encrypt ciphertext,
-- bytea) and `rib_last4` (plain text, the last 4 digits only). This mirrors
-- how a masked-display value is handled everywhere else sensitive data
-- needs a "yes it's set, here's a hint, but don't show the whole thing"
-- render (e.g. `client_portals`' PIN, 0020, is bcrypt-hashed with nothing
-- masked because a PIN is never displayed back at all; a RIB, unlike a PIN,
-- legitimately needs to be re-shown to the org that owns it, e.g. to
-- double check it before generating an invoice, but never needs to be
-- shown to anyone else). rib_last4 lets the settings screen show
-- "•••• •••• •••• 4821" without a decrypt round-trip on every render.

alter table organizations add column rib_encrypted bytea;
alter table organizations add column rib_last4 text;

comment on column organizations.rib_encrypted is
  'Plan §4.2 RIB/bank details. pgp_sym_encrypt ciphertext (pgcrypto, already
   an extension in this repo — 0001), key sourced from Supabase Vault via
   organization_get_rib_encryption_key() below, same shape as 0023''s
   admin_get_totp_encryption_key(). NEVER selected directly by any client
   role — see the update_organization_rib/get_organization_rib RPCs (Part 3)
   for the only two ways this column is ever written or read. No RLS
   SELECT policy exists on this column specifically because organizations
   has no column-level RLS in Postgres; the real boundary is that neither
   RPC below is grantable to anon and get_organization_rib_masked() (the
   one RPC any org member can call) never returns rib_encrypted at all,
   only rib_last4.';

comment on column organizations.rib_last4 is
  'Last 4 characters of the RIB, plain text, for masked display
   ("•••• 4821") without a decrypt call. Derived and stored at write time
   inside update_organization_rib() — never set directly.';

-- Same key-retrieval shape as 0023's admin_get_totp_encryption_key(): the
-- function's only job is hand the raw key to the encrypt/decrypt RPCs
-- below without ever exposing it to anon/authenticated directly. The key
-- itself must be inserted into vault.secrets by a one-time bootstrap
-- script (mirroring scripts/generate-totp-vault-key.ts, per 0023's own
-- comment) — NOT hardcoded into this migration file. Until that bootstrap
-- script has run in a real environment, update_organization_rib() below
-- will fail with "no key found," which is the correct, safe failure mode
-- (an org simply can't save a RIB yet) rather than falling back to
-- plaintext storage.
create or replace function organization_get_rib_encryption_key(key_version text default 'v1')
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'organization_rib_encryption_key_' || key_version;
$$;

comment on function organization_get_rib_encryption_key(text) is
  'Mirrors 0023''s admin_get_totp_encryption_key() exactly, for a different
   secret. Never granted to anon/authenticated — only called from inside
   the two security definer RPCs below, which run as the function owner.';

create or replace function update_organization_rib(p_org_id uuid, p_rib text)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_role text;
  v_key text;
begin
  v_role := org_role_of(p_org_id);
  -- Owner-only, matching matricule_fiscal/rc_number's own column-level
  -- restriction in update_organization_profile — RIB is at least as
  -- sensitive as a tax ID, and the plan's own §4.2 framing ties it
  -- directly to money movement (client invoicing).
  if v_role <> 'owner' then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if p_rib is null or length(trim(p_rib)) = 0 then
    update organizations set rib_encrypted = null, rib_last4 = null where id = p_org_id;
    return;
  end if;

  v_key := organization_get_rib_encryption_key();
  if v_key is null then
    raise exception 'Chiffrement indisponible. Contactez le support.' using errcode = 'P0001';
  end if;

  update organizations set
    rib_encrypted = pgp_sym_encrypt(trim(p_rib), v_key),
    rib_last4 = right(regexp_replace(trim(p_rib), '\s', '', 'g'), 4)
  where id = p_org_id;
end;
$$;

comment on function update_organization_rib(uuid, text) is
  'Owner-only. Encrypts with pgp_sym_encrypt before storing — see this
   migration''s own header for why real encryption was chosen over the
   "flag now, defer" pattern the plan doc assumed but which does not
   actually exist as precedent in this codebase.';

grant execute on function update_organization_rib(uuid, text) to authenticated;

-- Masked read: any org member can confirm "a RIB is on file, ending in
-- 4821" without ever decrypting it. This is the RPC organization-
-- settings.tsx actually calls for display.
create or replace function get_organization_rib_masked(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when is_org_member(p_org_id) then
    jsonb_build_object(
      'has_rib', rib_encrypted is not null,
      'rib_last4', rib_last4
    )
  else '{}'::jsonb end
  from organizations where id = p_org_id;
$$;

grant execute on function get_organization_rib_masked(uuid) to authenticated;

comment on function get_organization_rib_masked(uuid) is
  'Any org member — never the decrypted value, only "is one set" + last 4.
   The full RIB is never sent to a mobile client at all in this phase; no
   screen this phase builds needs the plaintext back (generate-invoice-pdf,
   the one place a real payment instruction might eventually need it, is
   explicitly NOT extended in this phase — see PHASE_10_BRIEF.md §2).';

-- ---------------------------------------------------------------------------
-- Part 3a — DEPENDENCY FOUND WHILE IMPLEMENTING, FIXED HERE RATHER THAN
-- DEFERRED, stated plainly per Phase 2's own precedent for this exact
-- situation (migration 0069's header).
-- ---------------------------------------------------------------------------
-- The unified profile screen this phase builds needs a WORKER session to
-- read their own `workers` row (trade, job_title, hire_date — none of
-- which live on `profiles`). Tracing that read before writing the screen
-- surfaced something bigger than this phase: `workers` has exactly two
-- RLS policies, both from migration 0005 — `workers_select_member`
-- (is_org_member(org_id)) and `workers_write_owner_manager`. Grepped every
-- migration for any `on workers` policy before concluding this, not
-- assumed: there has never been a self-select policy on this table at
-- all. `is_org_member()` checks `organization_members` (0005's own
-- definition) — a worker is never a row in that table, only in `workers`
-- itself. This means EVERY existing worker-facing screen that already
-- does `.from('workers').select(...).eq('user_id', session.user.id)` —
-- (worker)/home.tsx, salary.tsx, advance-request.tsx,
-- material-request.tsx, update-chantier.tsx, all pre-dating this phase —
-- would fail under real RLS enforcement for an actual worker session
-- today. This has apparently never been caught because no phase's brief,
-- including this one until now, has had a live Supabase instance to
-- actually run RLS against — every prior brief's own "manual verification
-- still required" section already discloses that constraint, and this is
-- the kind of gap that constraint predicts.
--
-- Fixed here, not flagged-and-deferred — same test Phase 2's migration
-- 0069 applied to submit_site_log_entry(): this phase's own new work
-- (the unified profile screen reading a worker's job_title/hire_date)
-- directly depends on it, and the fix is a small, purely ADDITIVE second
-- SELECT policy (Postgres combines multiple permissive policies for the
-- same command with OR), not a change to the existing policy or to any
-- other table. Every existing caller of `workers_select_member`
-- (owner/manager reading their roster) is completely unaffected.
create policy "workers_select_self" on workers
  for select using (user_id = auth.uid());

comment on policy "workers_select_self" on workers is
  'Phase 10, found while building the unified profile screen (§4.1 step
   3): workers had no self-select policy at all before this — every
   worker-facing screen reading their own row (home.tsx, salary.tsx, and
   others pre-dating this migration) depended on a policy that does not
   exist. Purely additive alongside workers_select_member (0005); does not
   change owner/manager roster access.';

-- ---------------------------------------------------------------------------
-- Part 3 — workers: job_title, hire_date (§4.3)
-- ---------------------------------------------------------------------------
-- No RLS change: workers_write_owner_manager (0005) is `for all`, no
-- column restriction — same reasoning as photo_url (0070). Plain columns,
-- written via a direct .update() the same way worker/[id].tsx already
-- writes photo_url (confirmed by reading that screen's write path before
-- concluding a new RPC wasn't needed here either) — not routed through
-- WatermelonDB (workers was confirmed, by reading pushChanges.ts's
-- GENERIC_UPSERT_TABLES set directly, to never be offline-synced at all;
-- every workers write in this app is already a live online call).

alter table workers add column job_title text;
alter table workers add column hire_date date;

comment on column workers.job_title is
  'Plan §4.3 — position distinct from trade (e.g. "Chef de chantier" for an
   électricien). Lives on workers, not profiles: contractor-set, works
   before AND after invite acceptance (workers.user_id is nullable — a
   worker with no linked account yet still needs a job title the moment
   they''re added, the same reasoning already established for
   workers.photo_url in migration 0070). Decision, disclosed: contractor/
   manager/owner profiles do NOT get an equivalent field — their
   organization_members.role (owner/manager/viewer) already serves the
   role-identification purpose a job title would for them, and inventing
   a second, freeform title field for org members wasn''t asked for by the
   plan and has no natural default to seed it with.';

comment on column workers.hire_date is
  'Plan §4.3 — real employment start date, explicitly distinct from
   organization_members.joined_at (which only tracks app-invite acceptance
   for an owner/manager/viewer, a different table entirely — workers are
   not organization_members rows, confirmed by reading both tables'' schema
   before deciding this). Scoped to workers only, not profiles: a
   contractor''s own "hire date" for their own org is meaningless (they
   founded or were invited to manage the org — organization_members.
   joined_at already captures that, and is exactly the field the plan says
   a real hire date must be distinct FROM, not a second thing needing its
   own date on profiles).';

-- job_title folds into the existing generated search_vector, alongside
-- trade — same tsvector composition question 0017 already answered for
-- email (add it, since it is a genuine searchable identity attribute:
-- "chef" should surface every site supervisor, the same way searching a
-- trade name already does). Generated columns can''t be ALTER'd in place;
-- drop + recreate under the same final name, mirroring 0017's own
-- drop-index/add-column/drop-old-column/rename sequence exactly.
--
-- BUG FOUND WHILE APPLYING THIS MIGRATION (fixed here, not deferred):
-- unlike 0017 (which ran before active_workers existed), `active_workers`
-- (0025, `select * from workers ...`) now depends on every column of
-- `workers` including `search_vector`, so `drop column search_vector`
-- fails with "cannot drop column search_vector ... other objects depend
-- on it" (view active_workers). A plain `select *` view has no stored
-- reference to a specific column's contents, so it's safe to drop and
-- recreate identically around the column swap — same definition and
-- security_invoker flag restored immediately after, per 0037's header.
drop view if exists active_workers;

alter table workers add column search_vector_v2 tsvector
  generated always as (
    to_tsvector(
      'french',
      coalesce(full_name, '') || ' ' || coalesce(trade, '') || ' ' ||
      coalesce(email, '') || ' ' || coalesce(job_title, '')
    )
  ) stored;
drop index if exists workers_search_idx;
create index workers_search_idx on workers using gin (search_vector_v2);
alter table workers drop column search_vector;
alter table workers rename column search_vector_v2 to search_vector;

-- Recreate active_workers exactly as 0025 defined it, with the
-- security_invoker flag 0037 added — dropping the view above does not
-- carry that setting back in automatically, so it's restored explicitly
-- rather than silently regressing the RLS fix 0037 shipped.
create or replace view active_workers as
  select * from workers where deleted_at is null;

alter view active_workers set (security_invoker = true);

comment on view active_workers is
  'Doc 02 §2.10 — workers excluding soft-deleted rows. security_invoker = true '
  '(added 0037) so RLS is enforced against the querying user, not the view '
  'owner — see 0037''s header for why this mattered and what it fixed.';

-- ---------------------------------------------------------------------------
-- Part 4 — profiles: emergency contact (§4.3)
-- ---------------------------------------------------------------------------
-- No RLS change: profiles_update_own (0005) is `id = auth.uid()`, no
-- column restriction, so a worker or contractor can already write these
-- two new columns for themselves the moment they exist. Universal (both
-- roles), unlike job_title/hire_date: an emergency contact is a personal
-- safety detail every human on a job site should have on file, not an
-- employment fact only a contractor declares about a worker. Disclosed
-- gap: a worker who has not yet accepted their invite has no profiles row
-- at all (user_id is null on their workers row until then), so a
-- contractor cannot pre-fill an emergency contact for them ahead of
-- acceptance the way job_title/hire_date can be — same "profiles requires
-- a linked account" limitation Phase 3 already disclosed for
-- profiles.avatar_url, not a new one invented here.

alter table profiles add column emergency_contact_name text;
alter table profiles add column emergency_contact_phone text;

comment on column profiles.emergency_contact_name is
  'Plan §4.3 — "if someone''s hurt on site, who do we call." Self-serve,
   same profiles_update_own (0005) RLS as full_name/phone/avatar_url.';

comment on column profiles.emergency_contact_phone is
  'Paired with emergency_contact_name. No phone-format validation beyond
   the existing changePhoneSchema-adjacent looseness already applied to
   profiles.phone/organizations.contact_phone elsewhere in this schema.';

-- ---------------------------------------------------------------------------
-- Part 5 — cross-user profile read (§4.3's own "confirm email reachability
-- for a profile that isn't the caller's own" finding)
-- ---------------------------------------------------------------------------
-- profiles_select_own (0005) is `id = auth.uid()` ONLY — confirmed by
-- reading that policy directly before concluding an RPC was needed at
-- all. A manager viewing a WORKER's unified profile screen (§4.1 step 3)
-- cannot select that worker's profiles row today, at all, for any column
-- — not just email_verified_at. This is a real, load-bearing gap the
-- unified profile screen this phase builds would otherwise silently hit
-- (an empty/broken render for anyone other than the profile's own owner).
--
-- Narrow, org-scoped, security definer read — mirrors the shape of
-- get_worker_invitation_by_token (0017) and get_organization_rib_masked
-- (Part 2 above): returns only what the unified profile screen actually
-- renders, never the full profiles row, never auth.users.email itself
-- (there is still no direct email column exposure here — this confirms
-- REACHABILITY via email_verified_at, it does not reveal the address).
create or replace function get_profile_summary_for_org_member(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shares_org boolean;
begin
  -- Caller must share at least one organization with the target: either
  -- both are organization_members of the same org, or the caller is an
  -- owner/manager of an org the target has a linked workers row in.
  select exists (
    select 1
    from organization_members om_self
    join organization_members om_target
      on om_target.org_id = om_self.org_id
    where om_self.user_id = auth.uid()
      and om_target.user_id = p_user_id
  ) or exists (
    select 1
    from workers w
    join organization_members om on om.org_id = w.org_id
    where w.user_id = p_user_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'manager')
  ) into v_shares_org;

  if not v_shares_org and p_user_id <> auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'full_name', full_name,
      'phone', phone,
      'avatar_url', avatar_url,
      'email_verified_at', email_verified_at,
      'last_login_at', last_login_at,
      'created_at', created_at,
      'profile_checklist_dismissed_at', profile_checklist_dismissed_at,
      'emergency_contact_name', emergency_contact_name,
      'emergency_contact_phone', emergency_contact_phone
    )
    from profiles where id = p_user_id
  );
end;
$$;

comment on function get_profile_summary_for_org_member(uuid) is
  'Plan §4.3''s own "confirm profiles email reachability for a profile
   that isn''t the caller''s own" finding, resolved. profiles_select_own
   (0005) is id = auth.uid() only — this RPC is the org-scoped read that
   policy deliberately does not provide, gated in-function (own profile,
   OR fellow organization_member, OR owner/manager of an org the target
   has a linked workers row in) rather than widening profiles_select_own
   itself, which would leak every column to every fellow member with no
   narrowing. Never returns auth.users.email — only email_verified_at
   (a boolean-shaped timestamp already living on profiles), so this
   confirms reachability without exposing the address itself.';

grant execute on function get_profile_summary_for_org_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 6 — individual profile completion + dismissal (§4.4)
-- ---------------------------------------------------------------------------
-- profile_checklist_dismissed_at already exists (0002) — this is wiring,
-- not new schema, for the dismiss/undismiss half of §4.4. The completion
-- PERCENTAGE itself is computed client-side (see ProfileScreen.tsx) rather
-- than in SQL: it depends on which fields apply to the viewer's OWN role
-- (a worker's checklist includes trade/hire_date sourced from their
-- workers row; a contractor/manager's does not, since they have no
-- workers row at all) — a single SQL function would need the same
-- role-branching logic the client already has to do to RENDER the
-- checklist items' labels, so computing it twice (once in SQL for a
-- number, once in the client for the actual "add a photo" nudge list)
-- would risk drift between the number shown and the items driving it.
-- The one small RPC this phase DOES add is the dismiss/undismiss pair,
-- matching organizations' own equivalent exactly (mirrored below).

create or replace function dismiss_profile_checklist(p_dismissed boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles
  set profile_checklist_dismissed_at = case when p_dismissed then now() else null end
  where id = auth.uid();
$$;

comment on function dismiss_profile_checklist(boolean) is
  'Plan §4.4. Self-only (auth.uid()), no org-scoping needed since this is a
   per-account dismissal, not a per-org one — mirrors org_checklist_
   dismissed_at''s own consumer pattern (see PHASE_10_BRIEF.md §1 for
   where that consumer actually lives, since the plan''s own instruction to
   "reuse its existing dismiss/undismiss interaction pattern" assumed a
   built screen that turned out not to exist yet either).';

grant execute on function dismiss_profile_checklist(boolean) to authenticated;

-- Same dismiss pattern for the ORG checklist — org_checklist_dismissed_at
-- (0003) has existed since Phase-0 build but, per this migration's own
-- Step 1 investigation, had ZERO consumers anywhere in the app (confirmed
-- by grep — no screen, no RPC touches it). This phase is the first to
-- actually wire it, for both org and individual, from the same
-- investigation — disclosed here rather than silently only building the
-- individual half and leaving the org column equally dormant.
create or replace function dismiss_org_checklist(p_org_id uuid, p_dismissed boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if org_role_of(p_org_id) not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  update organizations
  set org_checklist_dismissed_at = case when p_dismissed then now() else null end
  where id = p_org_id;
end;
$$;

comment on function dismiss_org_checklist(uuid, boolean) is
  'Companion to dismiss_profile_checklist, for organizations.
   org_checklist_dismissed_at (0003) had no consumer anywhere in this repo
   before this migration — confirmed by grep, not assumed. Owner/manager
   only, matching organizations_update_owner_manager (0005).';

grant execute on function dismiss_org_checklist(uuid, boolean) to authenticated;
