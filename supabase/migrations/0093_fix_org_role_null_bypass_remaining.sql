-- =============================================================================
-- 0093_fix_org_role_null_bypass_remaining.sql
--
-- CRITICAL FIX — completes 0040. Fifteen SECURITY DEFINER functions still gate
-- on a bare comparison against org_role_of(), which returns NULL for a caller
-- with no organization_members row (and for anon, where auth.uid() is NULL).
-- `NULL <> 'owner'` / `NULL not in (...)` is NULL, PL/pgSQL treats
-- `IF NULL` as false, so the raise is skipped and the function FAILS OPEN.
-- Reproduced live: a non-member could promote/remove owners, rewrite the
-- org profile and RIB, create advances/invoices and edit/delete site logs.
--
-- Fix (same pattern as 0040), applied to the CURRENT body of each function
-- (taken from the assembled schema, so later redefinitions are preserved):
--   1. every org_role_of(x) becomes coalesce(org_role_of(x), 'none');
--   2. explicit `auth.uid() is null` guard at the top (defence in depth);
--   3. EXECUTE revoked from PUBLIC and anon; authenticated/service_role keep
--      whatever they already had.
-- No other logic changes. Bodies are reproduced in full because
-- `create or replace function` requires it.
-- =============================================================================

-- approve_material_request(uuid,uuid)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.approve_material_request(p_material_id uuid, p_idempotency_key uuid)
 RETURNS TABLE(material materials, expense_pushed boolean, expense_skipped_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target materials;
  v_request_hash text;
  v_existing idempotency_keys;
  v_material materials;
  v_expense_pushed boolean := false;
  v_skip_reason text := null;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  select * into v_target from materials where id = p_material_id;
  if not found then
    raise exception 'material_not_found';
  end if;

  if coalesce(org_role_of(v_target.org_id), 'none') not in ('owner', 'manager') then
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
$function$;

-- create_advance(uuid,uuid,numeric,text,uuid,uuid,timestamp with time zone)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.create_advance(p_org_id uuid, p_worker_id uuid, p_amount numeric, p_reason text, p_idempotency_key uuid, p_id uuid DEFAULT NULL::uuid, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS advances
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_hash text;
  v_existing idempotency_keys;
  v_advance advances;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  if coalesce(org_role_of(p_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'insufficient_permissions';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  v_request_hash := md5(
    coalesce(p_org_id::text, '') || '|' ||
    coalesce(p_worker_id::text, '') || '|' ||
    coalesce(p_amount::text, '') || '|' ||
    coalesce(p_reason, '')
  );

  select * into v_existing from idempotency_keys where key = p_idempotency_key;

  if found then
    if v_existing.request_hash <> v_request_hash then
      raise exception 'idempotency_key_reused_with_different_payload';
    end if;
    select * into v_advance from advances where id = (v_existing.response_body ->> 'id')::uuid;
    return v_advance;
  end if;

  insert into advances (id, org_id, worker_id, amount, reason, status, approved_by, idempotency_key, created_at)
  values (
    coalesce(p_id, gen_random_uuid()), p_org_id, p_worker_id, p_amount, p_reason, 'approved', auth.uid(),
    p_idempotency_key, coalesce(p_created_at, now())
  )
  returning * into v_advance;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, p_org_id, 'create_advance', v_request_hash, 200, jsonb_build_object('id', v_advance.id));

  return v_advance;
end;
$function$;

-- create_invoice(uuid,date,date,date,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.create_invoice(p_project_id uuid, p_period_from date, p_period_to date, p_due_date date, p_notes text DEFAULT NULL::text)
 RETURNS invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid;
  v_line_items jsonb;
  v_subtotal numeric(12, 2);
  v_seq int;
  v_invoice_number text;
  v_invoice invoices;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  select lead_org_id into v_org_id from projects where id = p_project_id;
  if v_org_id is null then
    raise exception 'project_not_found';
  end if;
  if coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
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
$function$;

-- dismiss_org_checklist(uuid,boolean)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.dismiss_org_checklist(p_org_id uuid, p_dismissed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  if coalesce(org_role_of(p_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  update organizations
  set org_checklist_dismissed_at = case when p_dismissed then now() else null end
  where id = p_org_id;
end;
$function$;

-- dismiss_org_onboarding(uuid,boolean)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.dismiss_org_onboarding(p_org_id uuid, p_dismissed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  if coalesce(org_role_of(p_org_id), 'none') not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;
  update organizations
  set onboarding_dismissed_at = case when p_dismissed then now() else null end
  where id = p_org_id;
end;
$function$;

-- remove_organization_member(uuid,uuid)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.remove_organization_member(p_org_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_count int;
  v_target_role text;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  if coalesce(org_role_of(p_org_id), 'none') <> 'owner' then
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
$function$;

-- request_org_verification(uuid)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.request_org_verification(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  -- org_role_of (0028) is the existing owner/manager role-check helper
  -- update_organization_profile already uses for exactly this kind of
  -- self-serve org mutation — reused here rather than re-deriving
  -- membership logic.
  v_role := coalesce(org_role_of(p_org_id), 'none');
  if v_role not in ('owner', 'manager') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select verification_status into v_status from organizations where id = p_org_id;
  if not found then
    raise exception 'Organisation introuvable.' using errcode = 'P0002';
  end if;

  -- Only a genuinely unverified org can request verification — already
  -- pending (a second request wouldn't do anything) or already verified
  -- (nothing to request) are both no-ops, not errors, matching this
  -- schema's general "quiet no-op over a hard error for a state the UI
  -- shouldn't even let you reach" convention.
  if v_status <> 'unverified' then
    return;
  end if;

  update organizations
  set verification_status = 'pending',
      verification_requested_at = now()
  where id = p_org_id;
end;
$function$;

-- restore_site_log(uuid)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.restore_site_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log site_logs;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  select * into v_log from site_logs where id = p_log_id;

  if not found then
    raise exception 'site_log_not_found';
  end if;

  if v_log.logged_by is distinct from auth.uid()
     and coalesce(org_role_of(v_log.org_id), 'none') not in ('owner', 'manager') then
    raise exception 'not_authorized';
  end if;

  update site_logs
    set deleted_at = null
    where id = p_log_id and deleted_at > now() - interval '30 days';
end;
$function$;

-- soft_delete_site_log(uuid)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.soft_delete_site_log(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log site_logs;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  select * into v_log from site_logs where id = p_log_id;

  if not found then
    raise exception 'site_log_not_found';
  end if;

  if v_log.logged_by is distinct from auth.uid()
     and coalesce(org_role_of(v_log.org_id), 'none') not in ('owner', 'manager') then
    raise exception 'not_authorized';
  end if;

  update site_logs set deleted_at = now() where id = p_log_id;
end;
$function$;

-- submit_site_log_entry(uuid,text,text,text,text,numeric,numeric,uuid,uuid,timestamp with time zone,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.submit_site_log_entry(p_project_id uuid, p_photo_url text, p_voice_note_url text, p_note_text text, p_thumbnail_url text, p_location_lat numeric, p_location_lng numeric, p_idempotency_key uuid, p_id uuid DEFAULT NULL::uuid, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_caption text DEFAULT NULL::text)
 RETURNS site_logs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_worker workers;
  v_org_id uuid;
  v_hash_subject text;
  v_request_hash text;
  v_existing idempotency_keys;
  v_log site_logs;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  select * into v_worker from workers where user_id = auth.uid();

  if found then
    v_org_id := v_worker.org_id;
    v_hash_subject := v_worker.id::text;
  else
    -- Not a worker — allow the project's owning org's owner/manager
    -- (the contractor add-entry path, Phase 2) to log an entry on their
    -- own project. Falls through to the original exception if neither
    -- condition holds, so a viewer, an unrelated org's member, or an
    -- unauthenticated caller is rejected exactly as before.
    select p.lead_org_id into v_org_id from projects p where p.id = p_project_id;

    if v_org_id is null or coalesce(org_role_of(v_org_id), 'none') not in ('owner', 'manager') then
      raise exception 'no_worker_record_for_current_user';
    end if;

    v_hash_subject := auth.uid()::text;
  end if;

  if p_photo_url is null and p_voice_note_url is null and (p_note_text is null or length(trim(p_note_text)) = 0) then
    raise exception 'at_least_one_field_required';
  end if;

  if not exists (select 1 from projects where id = p_project_id and lead_org_id = v_org_id) then
    raise exception 'project_not_in_worker_org';
  end if;

  v_request_hash := md5(
    coalesce(v_hash_subject, '') || '|' ||
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
    id, org_id, project_id, photo_url, voice_note_url, note_text, thumbnail_url,
    location_lat, location_lng, logged_by, idempotency_key, caption, created_at
  )
  values (
    coalesce(p_id, gen_random_uuid()), v_org_id, p_project_id, p_photo_url, p_voice_note_url, p_note_text, p_thumbnail_url,
    p_location_lat, p_location_lng, auth.uid(), p_idempotency_key, p_caption, coalesce(p_created_at, now())
  )
  returning * into v_log;

  insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body)
  values (p_idempotency_key, v_org_id, 'submit_site_log_entry', v_request_hash, 200, jsonb_build_object('id', v_log.id));

  return v_log;
end;
$function$;

-- update_organization_extended_profile(uuid,text,text,text,text,text,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.update_organization_extended_profile(p_org_id uuid, p_legal_form text, p_workforce_size_bracket text, p_facebook_url text, p_instagram_url text, p_website_url text, p_service_area text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  if coalesce(org_role_of(p_org_id), 'none') not in ('owner', 'manager') then
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
$function$;

-- update_organization_member_role(uuid,uuid,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.update_organization_member_role(p_org_id uuid, p_user_id uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_count int;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  if coalesce(org_role_of(p_org_id), 'none') <> 'owner' then
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
$function$;

-- update_organization_profile(uuid,text,text,text,text,text,text,text,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.update_organization_profile(p_org_id uuid, p_name text, p_trade_type text, p_address text, p_contact_phone text, p_contact_email text, p_matricule_fiscal text, p_rc_number text, p_logo_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text;
  v_current organizations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  v_role := coalesce(org_role_of(p_org_id), 'none');
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
$function$;

-- update_organization_rib(uuid,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.update_organization_rib(p_org_id uuid, p_rib text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'vault'
AS $function$
declare
  v_role text;
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  v_role := coalesce(org_role_of(p_org_id), 'none');
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
$function$;

-- update_site_log_caption(uuid,text)  (1 role check(s) made null-safe)
CREATE OR REPLACE FUNCTION public.update_site_log_caption(p_log_id uuid, p_caption text)
 RETURNS site_logs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log site_logs;
begin
  if auth.uid() is null then
    raise exception 'insufficient_permissions' using errcode = '42501';
  end if;

  select * into v_log from site_logs where id = p_log_id;

  if not found then
    raise exception 'site_log_not_found';
  end if;

  if v_log.logged_by is distinct from auth.uid()
     and coalesce(org_role_of(v_log.org_id), 'none') not in ('owner', 'manager') then
    raise exception 'not_authorized';
  end if;

  update site_logs set caption = p_caption where id = p_log_id returning * into v_log;
  return v_log;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: none of these is meant to be callable without a session.
-- ---------------------------------------------------------------------------
revoke execute on function public.approve_material_request(uuid,uuid) from public, anon;
revoke execute on function public.create_advance(uuid,uuid,numeric,text,uuid,uuid,timestamp with time zone) from public, anon;
revoke execute on function public.create_invoice(uuid,date,date,date,text) from public, anon;
revoke execute on function public.dismiss_org_checklist(uuid,boolean) from public, anon;
revoke execute on function public.dismiss_org_onboarding(uuid,boolean) from public, anon;
revoke execute on function public.remove_organization_member(uuid,uuid) from public, anon;
revoke execute on function public.request_org_verification(uuid) from public, anon;
revoke execute on function public.restore_site_log(uuid) from public, anon;
revoke execute on function public.soft_delete_site_log(uuid) from public, anon;
revoke execute on function public.submit_site_log_entry(uuid,text,text,text,text,numeric,numeric,uuid,uuid,timestamp with time zone,text) from public, anon;
revoke execute on function public.update_organization_extended_profile(uuid,text,text,text,text,text,text) from public, anon;
revoke execute on function public.update_organization_member_role(uuid,uuid,text) from public, anon;
revoke execute on function public.update_organization_profile(uuid,text,text,text,text,text,text,text,text) from public, anon;
revoke execute on function public.update_organization_rib(uuid,text) from public, anon;
revoke execute on function public.update_site_log_caption(uuid,text) from public, anon;
