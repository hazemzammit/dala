-- =============================================================================
-- 0083_enforce_suspension_via_auth_hook.sql
--
-- Closes the most serious gap found in the mobile-only silent-gap audit:
-- organizations.suspended_at and profiles.suspended_at (0021) have had
-- stated, unambiguous intent since day one —
--   organizations.suspended_at: 'soft block: login blocked while set...'
--   profiles.suspended_at:      'per-user login block...'
-- — but nothing anywhere in the stack ever checked either column. Admin
-- (apps/admin) can set the flag and shows a "suspended" badge; RLS,
-- every Edge Function, and the mobile app itself never reference it at
-- all (confirmed by grepping `suspended_at` across the entire repo before
-- this migration — only writes/reads are inside apps/admin and one
-- platform-metrics aggregate count). A suspended org or user could keep
-- using the app completely normally, forever.
--
-- THIS IS OPTION B of the three options written up for Hazem (RLS-level
-- enforcement / auth-hook enforcement / both, phased) — Hazem chose
-- Option C: ship this (the auth hook) first, treat RLS-level enforcement
-- as a deliberate, disclosed follow-up rather than building it now. See
-- this migration's own "NOT DONE" note at the bottom for exactly what
-- that follow-up would close that this migration does not.
--
-- MECHANISM: a Supabase "Custom Access Token" Auth Hook — a Postgres
-- function GoTrue calls every time it mints a JWT, for BOTH the initial
-- sign-in AND every subsequent token refresh (unlike a "Password
-- Verification" hook, which only fires once, at initial sign-in). Raising
-- an exception here prevents token issuance entirely — no session is
-- created (initial sign-in) or the existing session's refresh is rejected
-- (an already-live session, suspended mid-session). This bounds the
-- residual-access window for an already-issued session to that session's
-- own access-token lifetime — supabase/config.toml's `jwt_expiry = 3600`,
-- so at most ~1 hour — rather than leaving it open indefinitely, which is
-- what today's total non-enforcement does.
--
-- CONFIRMED-UNCERTAIN, DISCLOSED PLAINLY (no live Supabase instance in
-- this sandbox to verify against, same standing constraint disclosed in
-- every migration touching live-instance-only behavior so far):
--   1. Using a Custom Access Token hook to REJECT token issuance (via
--      `raise exception`) rather than its primary documented purpose
--      (adding/modifying JWT claims) is a widely-documented community
--      pattern, not Supabase's own first-class billed use case for this
--      hook type. Expected to work based on how GoTrue is documented to
--      handle a hook function raising an error, but not confirmed live.
--   2. The exact error message/shape the mobile client receives back
--      from `signInWithPassword`/token refresh when this hook rejects is
--      not confirmed live either — GoTrue may wrap or replace the raised
--      message rather than passing it through verbatim. login.tsx below
--      matches on a distinctive marker substring
--      ('DALA_ACCOUNT_SUSPENDED') and falls back to the raw error message
--      if that marker doesn't survive whatever wrapping GoTrue applies —
--      degrades to "some error shown," never to "no error shown."
--   3. Enabling this hook on HOSTED Supabase additionally requires a
--      dashboard toggle (Authentication → Hooks) beyond what's expressible
--      in supabase/config.toml or this migration — same category of
--      "hosted vs. local CLI behavior differs" gotcha config.toml's own
--      existing MFA section already documents for this project, not a
--      new kind of gap.
--
-- NOT DONE, DELIBERATELY, PER OPTION C's PHASING (this is the Option A
-- follow-up, not built now): an already-issued, still-valid access token
-- continues to work normally against RLS-gated queries for the remainder
-- of its lifetime after suspension (up to ~1 hour) — this migration does
-- not touch is_org_member()/org_role_of()/is_project_member()/
-- is_own_worker() or any RLS policy. If an instant (not ≤1-hour) cutoff
-- is ever needed, that means folding a suspended_at check into those
-- predicate functions — deliberately not attempted here given how many
-- policies in this schema depend on them and this schema's own history
-- with a real recursion bug in exactly these functions (0039).
--
-- ALSO NOT DONE: no global auth-state-change listener exists anywhere in
-- the mobile app today (confirmed by grep — every screen calls
-- `supabase.auth.getSession()` individually rather than subscribing to
-- session changes). So while this hook DOES reject a mid-session token
-- refresh for a newly-suspended user, the mobile app has no shared place
-- today to catch that rejection and show a clean "you've been suspended"
-- screen — the practical effect for that specific case (already logged
-- in, suspended mid-session) will most likely be individual screens'
-- queries starting to fail piecemeal after the next refresh, not a clean
-- redirect. Login-time rejection (the common case) IS handled cleanly —
-- see login.tsx. A shared auth-state listener is a real, separate,
-- larger client-side change, not attempted here.

create or replace function check_suspension_before_token_issuance(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_suspended boolean;
begin
  v_user_id := (event->>'user_id')::uuid;

  select exists (
    select 1
    from profiles p
    left join organization_members om on om.user_id = p.id
    left join organizations o on o.id = om.org_id
    where p.id = v_user_id
      and (p.suspended_at is not null or o.suspended_at is not null)
  )
  into v_is_suspended;

  if v_is_suspended then
    raise exception 'DALA_ACCOUNT_SUSPENDED: this account or its organization has been suspended by an administrator';
  end if;

  return event;
end;
$$;

comment on function check_suspension_before_token_issuance(jsonb) is
  'Supabase Custom Access Token Auth Hook (see this migration''s header). '
  'Called by GoTrue on every JWT mint — initial sign-in AND token refresh. '
  'Raises an exception (marker: DALA_ACCOUNT_SUSPENDED) to block token '
  'issuance if profiles.suspended_at or the user''s organizations.'
  'suspended_at is set — the enforcement organizations.suspended_at/'
  'profiles.suspended_at (0021) were always documented to have but never '
  'had until this migration. Does not touch RLS — see header for the '
  'deliberately-not-done follow-up.';

revoke execute on function check_suspension_before_token_issuance(jsonb) from public, anon, authenticated;
grant execute on function check_suspension_before_token_issuance(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- Re-stated for accuracy now that enforcement actually exists — these
-- comments were correct in intent since 0021 but described a feature
-- that didn't exist yet until this migration.
comment on column organizations.suspended_at is
  'Doc 04 §4.3.3 — soft block: login blocked while set, no data deleted. Set/cleared only via the Admin app. Enforced via the check_suspension_before_token_issuance auth hook (0083) — blocks new sign-in and token refresh; does NOT invalidate an already-issued token before it expires (see 0083''s header for the disclosed residual-window tradeoff and the RLS-level follow-up this deliberately does not attempt).';
comment on column profiles.suspended_at is
  'Doc 04 §4.3.4 — per-user login block, independent of any org-level suspension. Enforced via the check_suspension_before_token_issuance auth hook (0083) — same residual-window caveat as organizations.suspended_at.';
