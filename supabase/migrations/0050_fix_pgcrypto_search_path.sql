-- =============================================================================
-- 0050_fix_pgcrypto_search_path.sql
-- Ref: "function gen_random_bytes(integer) does not exist" on
-- generate_client_portal_link (portail client → "Générer un lien client").
--
-- Root cause: migration 0001 installs pgcrypto with
-- `create extension if not exists "pgcrypto";` and no explicit schema. On
-- Supabase's Postgres image, pgcrypto (and several other extensions) is
-- already pre-installed into the `extensions` schema at cluster bootstrap,
-- before any project migration ever runs — so 0001's statement is a no-op
-- and pgcrypto's functions (gen_random_bytes, crypt, gen_salt, ...) live in
-- `extensions`, never in `public`. Every SECURITY DEFINER function below
-- pins `set search_path = public` (correctly, as a defense against
-- search_path-injection — see the Phase 16 grants-audit note in
-- migration 0041), but `public` alone doesn't include `extensions`, so any
-- unqualified call to a pgcrypto function inside these functions fails to
-- resolve at all. This isn't a new bug in any of these functions — it's
-- been latent since each was first written; `generate_client_portal_link`
-- is just the one that got exercised first and surfaced it.
--
-- Fix: re-declare each affected function via `create or replace function`
-- with the IDENTICAL signature and body as its current definition, adding
-- `extensions` to `search_path`. Identical signatures mean these replace
-- in place rather than create new overloads (see migration 0049's header
-- for why that distinction matters). `invite_org_to_project` (0044) is a
-- SECURITY INVOKER function with no search_path override at all — it
-- inherits whatever search_path the calling session has, which per
-- supabase/config.toml's `[api] extra_search_path = ["public"]` also
-- excludes `extensions`, so it has the same latent bug even though nobody
-- has hit it yet; fixed here too by giving it an explicit search_path
-- rather than leaving it dependent on caller/session state.
--
-- Scope check performed before writing this: every function in the schema
-- that calls gen_random_bytes/crypt/gen_salt/digest/hmac is listed here —
-- confirmed by grepping every migration file for those four function names
-- alongside `create or replace function`. count_unused_mfa_recovery_codes
-- (0029) uses neither and is unaffected.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- generate_client_portal_link (0020, redefined 0040) — the function whose
-- failure was actually reported.
-- ---------------------------------------------------------------------------
create or replace function generate_client_portal_link(p_project_id uuid)
returns client_portals
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  insert into client_portals (org_id, project_id, link_token)
  values (v_org_id, p_project_id, encode(gen_random_bytes(16), 'hex'))
  on conflict (project_id) do update
    set link_token = encode(gen_random_bytes(16), 'hex'),
        updated_at = now()
  returning * into v_portal;

  return v_portal;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_client_portal_pin (0020, redefined 0040) — same bug (crypt/gen_salt),
-- just not hit yet because setting a client-portal PIN hasn't been tried.
-- ---------------------------------------------------------------------------
create or replace function set_client_portal_pin(p_project_id uuid, p_pin text)
returns client_portals
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_portal client_portals;
begin
  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin_format';
  end if;

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

-- ---------------------------------------------------------------------------
-- request_phone_change / confirm_phone_change (0028) — same bug (crypt/
-- gen_salt), latent since phone re-verification was built in Phase 7.
-- ---------------------------------------------------------------------------
create or replace function request_phone_change(p_new_phone text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
begin
  if p_new_phone is null or length(trim(p_new_phone)) < 8 then
    raise exception 'Numéro de téléphone invalide.' using errcode = '22023';
  end if;

  v_code := lpad(floor(random() * 1000000)::text, 6, '0');

  delete from phone_change_requests where user_id = auth.uid() and confirmed_at is null;

  insert into phone_change_requests (user_id, new_phone, code_hash, expires_at)
  values (auth.uid(), p_new_phone, crypt(v_code, gen_salt('bf')), now() + interval '5 minutes');

  perform net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sms_provider_webhook_url'),
    body := jsonb_build_object('to', p_new_phone, 'code', v_code)
  );
end;
$$;

create or replace function confirm_phone_change(p_code text)
returns void language plpgsql security definer set search_path = public, extensions as $$
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

-- ---------------------------------------------------------------------------
-- generate_mfa_recovery_codes / verify_and_consume_recovery_code (0029) —
-- same bug (crypt/gen_salt). Not what caused "Impossible de démarrer
-- l'activation" (that's auth.mfa.enroll() itself, a native Supabase Auth
-- call — see migration 0051's header), but this would have failed on the
-- very next step (confirming the TOTP code) once enrollment itself works.
-- ---------------------------------------------------------------------------
create or replace function generate_mfa_recovery_codes()
returns text[] language plpgsql security definer set search_path = public, extensions as $$
declare
  v_aal text;
  v_codes text[] := array[]::text[];
  v_code text;
  i int;
begin
  v_aal := auth.jwt() ->> 'aal';
  if v_aal is distinct from 'aal2' then
    raise exception 'Vérification à deux facteurs requise.' using errcode = '42501';
  end if;

  delete from mfa_recovery_codes where user_id = auth.uid();

  for i in 1..10 loop
    v_code := '';
    for _ in 1..8 loop
      v_code := v_code || substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    v_codes := array_append(v_codes, v_code);
    insert into mfa_recovery_codes (user_id, code_hash) values (auth.uid(), crypt(v_code, gen_salt('bf')));
  end loop;

  return v_codes;
end;
$$;

create or replace function verify_and_consume_recovery_code(p_user_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare
  v_row mfa_recovery_codes%rowtype;
begin
  select * into v_row from mfa_recovery_codes
    where user_id = p_user_id and used_at is null and code_hash = crypt(p_code, code_hash)
    limit 1;

  if not found then
    return false;
  end if;

  update mfa_recovery_codes set used_at = now() where id = v_row.id;
  return true;
end;
$$;

-- Grants are unaffected by this migration (create or replace preserves
-- existing grants on a matching signature) — re-asserted here anyway as
-- cheap insurance against ever relying on that silently.
grant execute on function generate_client_portal_link(uuid) to authenticated;
grant execute on function set_client_portal_pin(uuid, text) to authenticated;
grant execute on function request_phone_change(text) to authenticated;
grant execute on function confirm_phone_change(text) to authenticated;
grant execute on function generate_mfa_recovery_codes() to authenticated;
revoke execute on function verify_and_consume_recovery_code(uuid, text) from authenticated, anon;
grant execute on function verify_and_consume_recovery_code(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- invite_org_to_project (0044) — SECURITY INVOKER with no search_path
-- override at all, so it silently depended on the calling session's
-- search_path (supabase/config.toml's `[api] extra_search_path`, which is
-- also just `["public"]`). Same latent bug, not yet hit. Giving it an
-- explicit search_path fixes that regardless of session state, without
-- changing it to SECURITY DEFINER (it wasn't one, and this migration isn't
-- the place to change that).
-- ---------------------------------------------------------------------------
create or replace function invite_org_to_project(
  p_project_id uuid,
  p_invited_phone text,
  p_invited_email text,
  p_trade_type text,
  p_sent_via text
)
returns uuid language plpgsql set search_path = public, extensions as $$
declare
  v_lead_org_id uuid;
  v_existing_id uuid;
  v_invitation_id uuid;
begin
  select lead_org_id into v_lead_org_id from projects where id = p_project_id;
  if v_lead_org_id is null then
    raise exception 'project_not_found';
  end if;

  if coalesce(org_role_of(v_lead_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if is_org_past_due(v_lead_org_id) then
    raise exception 'feature_requires_active_subscription'
      using detail = 'Multi-org collaboration is not available on the free tier.';
  end if;

  if p_invited_phone is null and p_invited_email is null then
    raise exception 'contact_required';
  end if;

  select id into v_existing_id
  from project_invitations
  where project_id = p_project_id
    and coalesce(invited_phone, '') = coalesce(p_invited_phone, '')
    and coalesce(invited_email, '') = coalesce(p_invited_email, '')
    and status = 'pending';

  if v_existing_id is not null then
    update project_invitations
    set token = encode(gen_random_bytes(24), 'hex'),
        expires_at = now() + interval '7 days',
        trade_type = p_trade_type,
        sent_via = p_sent_via
    where id = v_existing_id
    returning id into v_invitation_id;
  else
    insert into project_invitations (project_id, invited_phone, invited_email, trade_type, sent_via, token, expires_at)
    values (p_project_id, p_invited_phone, p_invited_email, p_trade_type, p_sent_via,
            encode(gen_random_bytes(24), 'hex'), now() + interval '7 days')
    returning id into v_invitation_id;
  end if;

  return v_invitation_id;
end;
$$;

-- Sanity check (run manually after applying): should return zero rows —
-- confirms extensions is actually resolvable from the search_path used
-- above (fails loudly here rather than surfacing again in the app).
-- select gen_random_bytes(1), crypt('x', gen_salt('bf'));
