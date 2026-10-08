-- =============================================================================
-- 0099_db_audit_triggers.sql
--
-- Audit finding P1-H: `audit_log_trigger()` was referenced in comments but
-- never defined or attached, and audit_log was only written by the admin
-- console. Customer-side changes with real money/access consequences — role
-- changes, advances, salary cycles, invoices, plan/billing/RIB edits,
-- suspension flags — left no trail, so disputes and incidents (like the
-- fail-open RPC takeover fixed in 0093) could not be investigated.
--
-- audit_row_change() is a generic AFTER ROW trigger that appends to audit_log:
--   action       '<table>.<insert|update|delete>'
--   actor_id     auth.uid() (NULL => actor_type 'system': service role / cron /
--                Edge Functions; end users are 'user')
--   target_*     table + row id (NULL id for organization_members, which has none)
--   org_id       the owning org, only if that org still exists (so a cascading
--                org delete can never trip audit_log's FK)
--   metadata     UPDATE: {"changed": {col: {"from":..., "to":...}}}, no-op and
--                updated_at-only updates are skipped; INSERT/DELETE: the row.
--                Secrets (rib_encrypted, push tokens, ...) are redacted, never
--                stored. `changed` still shows THAT they changed.
--
-- Failure policy: an audit failure raises a WARNING and never blocks the
-- business write (a construction crew must not lose a check-in because a log
-- insert failed). This is best-effort by design — monitor the warning.
--
-- audit_log stays service-role only (RLS, no policies); exposing history to
-- owners is a product decision, not made here. Existing retention job
-- cleanup_audit_log_retention() applies.
-- =============================================================================

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redact  constant text[] := array['rib_encrypted','totp_secret','totp_secret_encrypted','expo_push_token','encrypted_password','idempotency_key'];
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed jsonb := '{}'::jsonb;
  v_key     text;
  v_meta    jsonb;
  v_target  uuid;
  v_org     uuid;
  v_actor   uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = 'updated_at';
      if (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changed := v_changed || jsonb_build_object(
          v_key,
          case when v_key = any (v_redact)
               then jsonb_build_object('from', '[redacted]', 'to', '[redacted]')
               else jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key) end);
      end if;
    end loop;
    if v_changed = '{}'::jsonb then
      return null;                       -- nothing meaningful changed
    end if;
    v_row  := v_new;
    v_meta := jsonb_build_object('changed', v_changed);
  elsif tg_op = 'INSERT' then
    v_row  := to_jsonb(new);
    v_meta := jsonb_build_object('new', v_row - v_redact);
  else
    v_row  := to_jsonb(old);
    v_meta := jsonb_build_object('old', v_row - v_redact);
  end if;

  if (v_row ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_target := (v_row ->> 'id')::uuid;
  end if;

  v_org := case when tg_table_name = 'organizations'
                then (v_row ->> 'id')::uuid
                else nullif(v_row ->> 'org_id', '')::uuid end;
  if v_org is not null and not exists (select 1 from organizations o where o.id = v_org) then
    v_org := null;                       -- org being deleted: keep the FK safe
  end if;

  insert into audit_log (actor_id, actor_type, action, target_table, target_id, org_id, metadata)
  values (v_actor,
          case when v_actor is null then 'system' else 'user' end,
          tg_table_name || '.' || lower(tg_op),
          tg_table_name, v_target, v_org, v_meta);

  return null;
exception when others then
  raise warning 'audit_row_change failed on %.% (%): %', tg_table_schema, tg_table_name, tg_op, sqlerrm;
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  -- full lifecycle tables
  foreach t in array array['organization_members','advances','salary_cycles','invoices']
  loop
    execute format('drop trigger if exists audit_row_change on public.%I', t);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- organizations: every meaningful update (plan, billing, verification, RIB,
-- suspension, name...). Creation/deletion are covered by the RPCs / admin log.
drop trigger if exists audit_row_change on public.organizations;
create trigger audit_row_change after update on public.organizations
  for each row execute function public.audit_row_change();

-- profiles: only the security-relevant columns, not push tokens / active org noise.
drop trigger if exists audit_row_change on public.profiles;
create trigger audit_row_change after update on public.profiles
  for each row
  when (
    old.suspended_at is distinct from new.suspended_at
    or old.email_verified_at is distinct from new.email_verified_at
    or old.deletion_requested_at is distinct from new.deletion_requested_at
  )
  execute function public.audit_row_change();
