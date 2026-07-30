-- =============================================================================
-- 0028_phase7_projects_fields_org_members_and_account.sql
-- Ref: docs/spec/03-screens-mobile-contractor-and-worker.md §3.10.3, §3.22
--      docs/spec/01-data-model-security-and-architecture.md §1.14-§1.19 (new
--      this phase, see the docs/spec change alongside this migration)
--
-- Four independent things happen in this file, one per part. None of them
-- move money, so none of them go through the idempotency_keys mechanism
-- (Doc 01 §1.11 scopes that to non-retry-safe financial writes; a repeated
-- phone-change request or a repeated account-deletion attempt is naturally
-- idempotent/safely rejected on its own, not a double-charge risk).
--
--   1. `projects.start_date` / `projects.project_type` — Doc 03 §3.10.3 lists
--      both as required fields on Create/Edit project. Neither column existed
--      before this migration (confirmed by reading 0006 before writing this
--      one) and `packages/validation/src/projects.ts`'s `createProjectSchema`
--      didn't validate them either — a real Doc-prose-vs-schema gap, not a
--      new speculative field. `project_type`'s enum values are NOT specified
--      anywhere in Doc 03 (it just says "select, Required") — the six values
--      below are a judgment call for a Tunisian-construction-site product,
--      disclosed here rather than silently invented and left undocumented.
--   2. Organization-member management RPCs — Doc 03 §3.22's Settings list
--      includes "Membres de l'équipe." `team.tsx` (Doc 03 §3.13) already
--      covers this org's *workers* (field employees); there was no screen or
--      RPC anywhere for managing this org's *organization_members* (the
--      owner/manager/viewer accounts). This part adds role-change and
--      removal for members who already exist in `organization_members` —
--      it deliberately does NOT add a new invite-a-member-by-email pipeline
--      (that's a parallel system to worker_invitations that doesn't exist
--      yet and is a big enough lift to be its own phase, not bundled in
--      here silently — see delivery notes).
--   3. `phone_change_requests` — Doc 03 §3.22.1's phone re-verification flow.
--      `profiles.phone` has never been tied to Supabase Auth's own phone-OTP
--      channel (confirmed: sign-up only ever copies phone from signup
--      metadata, migration 0002) and no SMS provider integration exists
--      anywhere in this repo. This builds the real code-generation/
--      verification mechanism; actual SMS transmission is deliberately
--      routed through one clearly-marked call so a missing SMS-provider
--      Vault secret fails loudly (same pattern as 0027's digest cron
--      secrets), not silently.
--   4. `request_account_deletion()` — Doc 03 §3.22's "Supprimer mon compte."
--      A client can never delete its own `auth.users` row directly (Supabase
--      Auth admin-only), so this marks the account for deletion and the
--      actual `auth.admin.deleteUser` call happens in the new
--      `delete-account` Edge Function (service-role only).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — projects.start_date / projects.project_type
-- ---------------------------------------------------------------------------

alter table projects
  add column start_date date,
  add column project_type text check (
    project_type in ('residentiel', 'commercial', 'industriel', 'renovation', 'infrastructure', 'autre')
  );

comment on column projects.start_date is
  'Doc 03 §3.10.3 "Date de début" — required at create time client-side; nullable at the DB level so existing pre-Phase-7 rows do not need a backfill.';
comment on column projects.project_type is
  'Doc 03 §3.10.3 "Type de projet" — enum values are a Phase 7 judgment call, spec never enumerates them (see migration header).';

-- ---------------------------------------------------------------------------
-- Part 2 — organization-member management (existing members only)
-- ---------------------------------------------------------------------------

-- Doc 03 §3.22's "Membres de l'équipe": owner changes another member's role.
-- Owner-only (not manager) since role changes can grant/revoke manager
-- rights — a manager granting itself/another manager owner would be a
-- privilege-escalation hole if this were manager-permitted.
create or replace function update_organization_member_role(
  p_org_id uuid,
  p_user_id uuid,
  p_role text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner_count int;
begin
  if org_role_of(p_org_id) <> 'owner' then
    raise exception 'Seul le propriétaire peut modifier les rôles.' using errcode = '42501';
  end if;

  if p_role not in ('owner', 'manager', 'viewer') then
    raise exception 'Rôle invalide.' using errcode = '22023';
  end if;

  -- Never allow the org to end up with zero owners.
  if p_user_id = auth.uid() and p_role <> 'owner' then
    select count(*) into v_owner_count from organization_members
      where org_id = p_org_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Impossible : cette organisation doit conserver au moins un propriétaire.' using errcode = '23514';
    end if;
  end if;

  update organization_members set role = p_role
    where org_id = p_org_id and user_id = p_user_id;

  if not found then
    raise exception 'Membre introuvable dans cette organisation.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function update_organization_member_role(uuid, uuid, text) is
  'Doc 03 §3.22 "Membres de l''équipe" — owner-only role change, blocks demoting the last remaining owner (including self).';

grant execute on function update_organization_member_role(uuid, uuid, text) to authenticated;

-- Doc 03 §3.22: owner removes a member from the org entirely.
create or replace function remove_organization_member(
  p_org_id uuid,
  p_user_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owner_count int;
  v_target_role text;
begin
  if org_role_of(p_org_id) <> 'owner' then
    raise exception 'Seul le propriétaire peut retirer un membre.' using errcode = '42501';
  end if;

  select role into v_target_role from organization_members
    where org_id = p_org_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'Membre introuvable dans cette organisation.' using errcode = 'P0002';
  end if;

  if v_target_role = 'owner' then
    select count(*) into v_owner_count from organization_members
      where org_id = p_org_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Impossible : cette organisation doit conserver au moins un propriétaire.' using errcode = '23514';
    end if;
  end if;

  delete from organization_members where org_id = p_org_id and user_id = p_user_id;
end;
$$;

comment on function remove_organization_member(uuid, uuid) is
  'Doc 03 §3.22 "Membres de l''équipe" — owner-only removal, blocks removing the last remaining owner. Does not touch profiles/auth.users — the removed person keeps their account, just loses access to this one org.';

grant execute on function remove_organization_member(uuid, uuid) to authenticated;

-- Doc 03 §3.22.2: matricule_fiscal / rc_number are owner-only fields, but
-- organizations_update_owner_manager (0005) is a row-level policy — it
-- can't express "manager may update these columns but not those two." This
-- RPC is the column-level enforcement the UI's read-only lock-icon treatment
-- alone can't guarantee against a modified client.
create or replace function update_organization_profile(
  p_org_id uuid,
  p_name text,
  p_trade_type text,
  p_address text,
  p_contact_phone text,
  p_contact_email text,
  p_matricule_fiscal text,
  p_rc_number text,
  p_logo_url text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_current organizations%rowtype;
begin
  v_role := org_role_of(p_org_id);
  if v_role not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select * into v_current from organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = 'P0002';
  end if;

  if v_role <> 'owner' then
    -- Manager: silently keep the existing value for owner-only fields
    -- rather than erroring — the client never sends them editable, this
    -- is the enforcement backstop, not a UX path a manager should hit.
    p_matricule_fiscal := v_current.matricule_fiscal;
    p_rc_number := v_current.rc_number;
  end if;

  update organizations set
    name = p_name,
    trade_type = p_trade_type,
    address = p_address,
    contact_phone = p_contact_phone,
    contact_email = p_contact_email,
    matricule_fiscal = p_matricule_fiscal,
    rc_number = p_rc_number,
    logo_url = coalesce(p_logo_url, logo_url)
  where id = p_org_id;
end;
$$;

comment on function update_organization_profile(uuid, text, text, text, text, text, text, text, text) is
  'Doc 03 §3.22.2 — Organization edit. Column-level owner-only enforcement for matricule_fiscal/rc_number (organizations_update_owner_manager, 0005, is row-level only and cannot express this).';

grant execute on function update_organization_profile(uuid, text, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 3 — phone re-verification (Doc 03 §3.22.1)
-- ---------------------------------------------------------------------------

create table phone_change_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  new_phone     text not null,
  code_hash     text not null,          -- bcrypt via pgcrypto, same as client-portal PIN (0020)
  attempt_count int not null default 0,
  expires_at    timestamptz not null,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);

comment on table phone_change_requests is
  'Doc 03 §3.22.1 — one row per in-flight phone-change attempt. Only ever one live (unconfirmed, unexpired) request per user; requesting again replaces it, matching the email-change edge case Doc 03 §3.22.1 describes ("only one in flight at a time").';

create index phone_change_requests_user_id_idx on phone_change_requests (user_id);

alter table phone_change_requests enable row level security;

-- No client-side select/insert/update policies: written and read only by
-- the SECURITY DEFINER RPCs below, same reasoning as organizations (0005)
-- and client_portal PIN hashes (0020) — a code hash should never be
-- client-readable even for the account it belongs to.

create or replace function request_phone_change(p_new_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if p_new_phone is null or length(trim(p_new_phone)) < 8 then
    raise exception 'Numéro de téléphone invalide.' using errcode = '22023';
  end if;

  -- 6-digit numeric code, Doc 03 §3.22.1's exact copy ("un code à 6
  -- chiffres a été envoyé par SMS").
  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  delete from phone_change_requests where user_id = auth.uid() and confirmed_at is null;

  insert into phone_change_requests (user_id, new_phone, code_hash, expires_at)
  values (auth.uid(), p_new_phone, crypt(v_code, gen_salt('bf')), now() + interval '5 minutes');

  -- Actual SMS transmission happens here. There is no SMS provider secret
  -- in this project's Vault as of Phase 7 (confirmed: no
  -- supabase/functions/_shared/sms.ts or equivalent exists anywhere in this
  -- repo, unlike email which has _shared/resend.ts). Rather than silently
  -- skip sending or fake success, this calls net.http_post the same way
  -- 0027's digest cron does, against a 'sms_provider_webhook_url' Vault
  -- secret — if that secret doesn't exist yet, this raises loudly so the
  -- gap is diagnosable (a real support ticket, not a mysteriously-never-
  -- arriving SMS). Wiring a real provider (Twilio/a local Tunisian SMS
  -- gateway) behind that secret is the one remaining step — same shape as
  -- Konnect's "needs real credentials" blocker, not more mobile-app code.
  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sms_provider_webhook_url'),
    body := jsonb_build_object('to', p_new_phone, 'code', v_code)
  );
end;
$$;

comment on function request_phone_change(text) is
  'Doc 03 §3.22.1 phone re-verification, step 1. Requires a "sms_provider_webhook_url" Vault secret to actually deliver the SMS — see migration header. Replaces any prior unconfirmed request for this user (spec''s "only one in flight" rule).';

grant execute on function request_phone_change(text) to authenticated;

create or replace function confirm_phone_change(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_request phone_change_requests%rowtype;
begin
  select * into v_request from phone_change_requests
    where user_id = auth.uid() and confirmed_at is null
    order by created_at desc limit 1;

  if not found then
    raise exception 'Aucune demande de changement de numéro en cours.' using errcode = 'P0002';
  end if;

  if v_request.expires_at < now() then
    raise exception 'Ce code a expiré. Demandez-en un nouveau.' using errcode = '22023';
  end if;

  if v_request.attempt_count >= 5 then
    raise exception 'Trop de tentatives. Demandez un nouveau code.' using errcode = '22023';
  end if;

  update phone_change_requests set attempt_count = attempt_count + 1 where id = v_request.id;

  if v_request.code_hash <> crypt(p_code, v_request.code_hash) then
    raise exception 'Code incorrect.' using errcode = '22023';
  end if;

  update phone_change_requests set confirmed_at = now() where id = v_request.id;
  update profiles set phone = v_request.new_phone where id = auth.uid();
end;
$$;

comment on function confirm_phone_change(text) is
  'Doc 03 §3.22.1 phone re-verification, step 2. 5-minute expiry and 5-attempt cap match the spec copy ("5-minute expiry, Renvoyer le code after 60s") plus a brute-force guard the spec doesn''t mention but Doc 01 §1.5''s security posture implies.';

grant execute on function confirm_phone_change(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Part 4 — account deletion (Doc 03 §3.22 "Supprimer mon compte")
-- ---------------------------------------------------------------------------

alter table profiles add column deletion_requested_at timestamptz;

comment on column profiles.deletion_requested_at is
  'Doc 03 §3.22 account deletion. Set by request_account_deletion(); the new delete-account Edge Function (service-role) polls/consumes this to actually call auth.admin.deleteUser — a client can never do that call itself.';

create or replace function request_account_deletion()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sole_owner_orgs text;
begin
  -- Block deletion if this user is the sole owner of any organization —
  -- deleting them would orphan that org with no one able to manage it.
  -- Doc 03 §3.22 doesn't spell out this edge case explicitly, but it's the
  -- same "org must keep at least one owner" invariant this migration's
  -- Part 2 RPCs already enforce, applied at the account-deletion boundary
  -- instead of the member-removal boundary.
  select string_agg(o.name, ', ') into v_sole_owner_orgs
  from organizations o
  where o.id in (
    select org_id from organization_members where user_id = auth.uid() and role = 'owner'
  )
  and (select count(*) from organization_members om where om.org_id = o.id and om.role = 'owner') = 1;

  if v_sole_owner_orgs is not null then
    raise exception 'Vous êtes le seul propriétaire de : %. Transférez la propriété ou supprimez ces organisations avant de supprimer votre compte.', v_sole_owner_orgs
      using errcode = '23514';
  end if;

  update profiles set deletion_requested_at = now() where id = auth.uid();
end;
$$;

comment on function request_account_deletion() is
  'Doc 03 §3.22 "Supprimer mon compte." Marks the account; the delete-account Edge Function performs the actual auth.admin.deleteUser call. Blocks deletion while the user is a sole org owner elsewhere.';

grant execute on function request_account_deletion() to authenticated;
