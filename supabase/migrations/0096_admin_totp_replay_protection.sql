-- =============================================================================
-- 0096_admin_totp_replay_protection.sql
--
-- Audit finding: admin login step 2 accepted the same TOTP code any number of
-- times inside its validity window (±1 step = up to 90s) and the challenge
-- cookie allowed unlimited guesses. Attempt throttling is done in the app
-- via check_rate_limit(); this migration adds the missing REPLAY guard.
--
-- platform_admins.totp_last_used_step stores the highest 30-second TOTP time
-- step already consumed for that admin. admin_consume_totp_step() advances it
-- atomically: it returns true only if p_step is strictly greater than the
-- stored value, so a replayed (same or older) code — or the losing side of
-- two concurrent submissions of one code — gets false.
--
-- Service-role only (called from apps/admin's server routes).
-- =============================================================================

alter table public.platform_admins
  add column if not exists totp_last_used_step bigint;

create or replace function public.admin_consume_totp_step(p_admin_id uuid, p_step bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  update platform_admins
     set totp_last_used_step = p_step
   where id = p_admin_id
     and (totp_last_used_step is null or totp_last_used_step < p_step);
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.admin_consume_totp_step(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.admin_consume_totp_step(uuid, bigint) to service_role;
