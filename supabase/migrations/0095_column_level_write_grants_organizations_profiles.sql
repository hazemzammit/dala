-- =============================================================================
-- 0095_column_level_write_grants_organizations_profiles.sql
--
-- CRITICAL FIX (audit finding P1-A). 0016's blanket grants gave `authenticated`
-- table-level INSERT/UPDATE/DELETE on organizations and UPDATE on profiles.
-- RLS decides WHICH ROWS may be written, not WHICH COLUMNS — so, reproduced
-- live: a manager could set plan='enterprise', subscription_status='active',
-- seat_price_millimes=0, verification_status='verified', overwrite the RIB
-- columns and clear suspended_at/deleted_at on their own org; any user could
-- INSERT an organizations row with plan='enterprise'; any user could set their
-- own suspended_at=null / email_verified_at=now(). Because is_org_past_due()
-- (0044 free-tier caps) reads organizations.subscription_status, this was a
-- direct billing bypass.
--
-- organizations: NO client code writes this table directly (verified across
--   apps/web and apps/mobile; org creation and every edit go through
--   SECURITY DEFINER RPCs, which run as the function owner and are
--   unaffected). So all client INSERT/UPDATE/DELETE is revoked. The existing
--   RLS policies stay as a second layer.
-- profiles: clients legitimately update only the columns granted below
--   (full_name, avatar_url, emergency_contact_*, notification_prefs,
--   expo_push_token, active_org_id). Everything else (email_verified_at,
--   suspended_at, deletion_requested_at, phone, last_login_*, ...) is
--   server-managed. A new user-editable profile column needs an explicit
--   `grant update (col) on profiles to authenticated`.
-- active_org_id: additionally constrained by a trigger so a user can only
--   point it at an org they belong to (organization_members) or work for
--   (workers.user_id) — previously any foreign org UUID was accepted.
--
-- service_role and the function owner are unaffected (no auth.uid()).
-- =============================================================================

-- organizations ---------------------------------------------------------------
revoke insert, update, delete on public.organizations from anon, authenticated;

-- profiles --------------------------------------------------------------------
revoke insert, update, delete on public.profiles from anon, authenticated;

grant update (
  full_name,
  avatar_url,
  emergency_contact_name,
  emergency_contact_phone,
  notification_prefs,
  expo_push_token,
  active_org_id
) on public.profiles to authenticated;

-- active_org_id membership guard ---------------------------------------------
create or replace function public.profiles_guard_active_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only end-user sessions are constrained; service-role/admin/system writes
  -- (auth.uid() is null) and no-op updates pass through.
  if auth.uid() is null
     or new.active_org_id is null
     or new.active_org_id is not distinct from old.active_org_id then
    return new;
  end if;

  if not exists (
       select 1 from public.organization_members m
       where m.user_id = new.id and m.org_id = new.active_org_id
     )
     and not exists (
       select 1 from public.workers w
       where w.user_id = new.id and w.org_id = new.active_org_id
     )
  then
    raise exception 'active_org_not_a_member' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.profiles_guard_active_org() from public, anon, authenticated;

drop trigger if exists profiles_guard_active_org on public.profiles;
create trigger profiles_guard_active_org
  before update of active_org_id on public.profiles
  for each row execute function public.profiles_guard_active_org();
