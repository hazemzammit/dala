-- supabase/migrations/0077_phase12_launch_readiness.sql
--
-- Improvement-plan §11 "Ongoing, not a phase" line item, executed as
-- "Phase 12 — Launch readiness" purely as an execution/numbering
-- convention (see docs/PHASE_12_BRIEF.md's own header for the disclosed
-- naming choice — the plan's own §11 text is explicit this bucket isn't a
-- numbered phase like 1–11). Scope: §10.1–§10.7 production-readiness gaps
-- plus the two standalone decisions §6.4 (OTA) and §6.6 (biometric lock).
-- This migration only carries the parts of that scope that are genuinely
-- schema/RPC-shaped: §10.4 (rate limiting) and §10.7 (first-run
-- onboarding). §6.6 (biometric lock) is device-local only — SecureStore,
-- no schema. §6.4 (OTA) touches app.json/eas.json only, no schema. §10.1
-- (sync verification), §10.2 (Detox), §10.3 (Sentry), §10.5 (app store),
-- §10.6 (backup/DR) are either mobile-code-only or documentation — no SQL.
--
-- -----------------------------------------------------------------------------
-- Part 1 — §10.4 Rate limiting on public-facing Edge Functions
--
-- Step 1 investigation, stated here rather than assumed: grepped every
-- Edge Function reachable without an authenticated session before writing
-- anything. Five such functions exist: sign-up, accept-worker-invitation,
-- accept-organization-invitation, forgot-password, mfa-recover,
-- generate-invoice-pdf (its anonymous client-portal path only), and the
-- anon-granted RPCs get_worker_invitation_by_token / get_project_
-- invitation_by_token / verify_client_portal_access / verify_client_
-- portal_invoice / get_org_logo_signed_url.
--
-- Confirmed by reading each function's own body (not assumed from its
-- name): sign-up, forgot-password, and mfa-recover all call Supabase
-- Auth's own public GoTrue endpoints under the hood (auth.signUp,
-- auth.resetPasswordForEmail, the MFA challenge/verify flow) — these ARE
-- covered by Supabase Auth's own configurable platform rate limits
-- (confirmed current via docs.supabase.com/guides/auth/rate-limits:
-- "Supabase Auth enforces rate limits on authentication endpoints to
-- prevent abuse... configurable in project Authentication > Rate
-- Limits"). accept-worker-invitation and accept-organization-invitation
-- do NOT go through that path — both call `admin.createUser()` via a
-- SERVICE-ROLE client (confirmed by reading both files' own `admin.auth.
-- admin.createUser` call), which bypasses GoTrue's public rate limiting
-- entirely, the same way any service-role call bypasses RLS. These two
-- are therefore the real, confirmed gap — not a guess, not "might also
-- need it": Supabase's own platform default provides ZERO abuse
-- protection on this exact code path.
--
-- verify_client_portal_access already has its own bespoke 5-attempts/
-- 15-minute PIN lockout (migration 0074) — that one is NOT a gap. A
-- second, genuinely new gap was found while re-reading 0074's two
-- portal-verification functions side by side for this phase:
-- verify_client_portal_invoice (the RPC generate-invoice-pdf's anonymous
-- path calls to re-verify a download) checks the PIN but never
-- increments failed_pin_attempts/locked_until on a wrong guess — its own
-- comment says this is deliberate ("verify_client_portal_access already
-- owns that bookkeeping"), but that reasoning only holds if every PIN
-- guess is forced through the page-load path first. It isn't: a caller
-- who already has a valid, unexpired portal token (e.g. a previously
-- bookmarked/shared link) can call generate-invoice-pdf directly, an
-- unlimited number of times, guessing PINs against verify_client_portal_
-- invoice with NO lockout ever triggering. This is a real, currently-live
-- gap, not hypothetical — fixed in Part 2 below.
--
-- Design: a small, generic Postgres-backed fixed-window counter — no
-- Redis/Upstash dependency (this project has no such dependency anywhere,
-- and Supabase's own rate-limiting example guide reaches for Upstash
-- specifically because most callers don't already have a Postgres
-- connection sitting right there the way every one of THIS project's
-- Edge Functions already does, via its own service-role client). A
-- security-definer RPC, callable ONLY by the service_role — never granted
-- to `authenticated` or `anon` — matching this codebase's own established
-- "anon-facing surfaces get a narrow, purpose-built SECURITY DEFINER RPC,
-- never a direct table grant" pattern (docs/ARCHITECTURE.md's "Client-
-- facing surfaces need their own auth story" section), just inverted here
-- for a function that must be UNREACHABLE from anon/authenticated, not
-- reachable — the checking itself is a trust-boundary decision the Edge
-- Function's own service-role identity should make, never the caller.
create table edge_function_rate_limits (
  rate_key      text primary key,
  window_start  timestamptz not null default now(),
  request_count int not null default 0
);

comment on table edge_function_rate_limits is
  'Phase 12 (improvement-plan §10.4). Fixed-window request counter for
   public-facing Edge Functions that are not covered by Supabase Auth''s
   own platform rate limits (see this migration''s own Part 1 header for
   which functions those are and why). rate_key is caller-composed, e.g.
   ''accept-worker-invitation:token:<uuid>'' or ''accept-worker-invitation:
   ip:<address>'' — two independent keys per request (token-scoped AND
   IP-scoped) let a legitimate retried request from one person succeed
   while still bounding how many DIFFERENT tokens one IP can hammer.';

create or replace function check_rate_limit(p_key text, p_max_requests int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row edge_function_rate_limits;
begin
  -- Single-statement upsert-and-increment-or-reset, so two concurrent
  -- requests racing the same key can't both read a stale count before
  -- either writes (the classic read-then-write rate-limiter race) —
  -- `insert ... on conflict do update` is atomic per-row in Postgres,
  -- confirmed against this project's own established idempotency-key
  -- pattern (packages/validation/src/money.ts's callers all rely on the
  -- same atomic-upsert guarantee for a different table).
  insert into edge_function_rate_limits (rate_key, window_start, request_count)
  values (p_key, now(), 1)
  on conflict (rate_key) do update
    set request_count = case
          when edge_function_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then 1
          else edge_function_rate_limits.request_count + 1
        end,
        window_start = case
          when edge_function_rate_limits.window_start < now() - make_interval(secs => p_window_seconds)
            then now()
          else edge_function_rate_limits.window_start
        end
  returning * into v_row;

  return v_row.request_count <= p_max_requests;
end;
$$;

comment on function check_rate_limit(text, int, int) is
  'Phase 12 (improvement-plan §10.4). Service-role only (see grant below —
   deliberately NOT granted to authenticated/anon, the inverse of every
   other anon-facing RPC in this schema, because the whole point is that
   the CALLER cannot be the thing deciding whether it is rate-limited).
   Fixed-window (not sliding/token-bucket) — a caller could in theory send
   a burst right at a window boundary and get up to 2x p_max_requests in a
   short span; accepted as a known, disclosed simplification for a v1 of
   abuse protection on functions that had ZERO protection before this
   migration — a fixed window closes the actual gap (unbounded automated
   abuse) even though it is not a perfectly smooth limiter. Returns true
   (allowed) or false (blocked); throws nothing, so a caller''s own
   try/catch stays simple — treat a false return as a 429.';

revoke all on function check_rate_limit(text, int, int) from public, authenticated, anon;
grant execute on function check_rate_limit(text, int, int) to service_role;

-- Periodic cleanup so this table doesn't grow unbounded — reuses the same
-- pg_cron dependency 0026/0027/0030 already establish (docs/ARCHITECTURE.md's
-- own "net.http_post... already a dependency" note applies to pg_cron the
-- same way), not a new scheduling mechanism. Purges rows whose window
-- closed more than a day ago — generous relative to every window this
-- phase actually uses (measured in minutes/hours), so this never purges a
-- row a request still in flight might need.
select cron.schedule(
  'purge-rate-limit-rows',
  '0 3 * * *',
  $$ delete from edge_function_rate_limits where window_start < now() - interval '1 day'; $$
);

-- -----------------------------------------------------------------------------
-- Part 2 — verify_client_portal_invoice PIN-lockout gap (found during this
-- phase's own §10.4 investigation, fixed here since it's the exact same
-- "public-facing endpoint, no abuse protection" class this migration is
-- already about, not a later-phase item pulled forward).
--
-- Adds the SAME lockout check-and-increment verify_client_portal_access
-- already does, WITHOUT touching the reset-on-success half — that
-- bookkeeping ownership split is intentional and unchanged: only the
-- page-load path (verify_client_portal_access) ever clears
-- failed_pin_attempts back to 0. This function now also LOCKS (checks
-- locked_until, raises 'locked') and INCREMENTS on a wrong guess, closing
-- the unlimited-guessing gap, but a correct guess here does not reset the
-- counter — the person still has to reload the portal page (which does
-- reset it) to fully clear a lockout, which is an acceptable, disclosed
-- trade-off: the alternative (letting this path also reset the counter)
-- would let an attacker who eventually guesses right here erase their own
-- attempt history, silently undermining the lockout's own purpose.
-- -----------------------------------------------------------------------------
create or replace function verify_client_portal_invoice(p_token text, p_pin text, p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal client_portals;
  v_invoice invoices;
begin
  select * into v_portal from client_portals where link_token = p_token;
  if v_portal.id is null then
    raise exception 'not_found';
  end if;
  if v_portal.locked_until is not null and v_portal.locked_until > now() then
    raise exception 'locked';
  end if;
  if v_portal.pin_enabled then
    if p_pin is null or v_portal.pin_hash is null or crypt(p_pin, v_portal.pin_hash) <> v_portal.pin_hash then
      -- FIX (Phase 12, §10.4) — this branch used to just raise, with no
      -- bookkeeping at all. Now mirrors verify_client_portal_access's own
      -- increment-and-maybe-lock logic exactly, minus the reset-on-success
      -- half (see header above for why that stays asymmetric on purpose).
      update client_portals
        set failed_pin_attempts = failed_pin_attempts + 1,
            locked_until = case when failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
        where id = v_portal.id;
      raise exception 'pin_required';
    end if;
  end if;

  select * into v_invoice from invoices where id = p_invoice_id and project_id = v_portal.project_id;
  if v_invoice.id is null then
    raise exception 'not_found';
  end if;

  return v_invoice;
end;
$$;

comment on function verify_client_portal_invoice(text, text, uuid) is
  'Phase 9 §2.5 originally; FIXED Phase 12 (§10.4) — now increments the
   same failed_pin_attempts/locked_until columns verify_client_portal_access
   owns, closing a real unlimited-PIN-guessing gap this exact function had
   (a caller holding a valid token could call generate-invoice-pdf directly,
   bypassing the page-load path''s lockout entirely). Does NOT reset the
   counter on a correct guess — only verify_client_portal_access''s
   page-load path does that; see this migration''s own Part 2 header for
   why that split is intentional, not an oversight.';

-- -----------------------------------------------------------------------------
-- Part 3 — §10.7 First-run onboarding for new orgs
--
-- Step 1 investigation: read organization-settings.tsx's own §4.4
-- completion-nudge implementation and migration 0075's dismiss_org_
-- checklist() before writing anything, per this phase's own instruction
-- to mirror the existing pattern rather than invent a second one.
--
-- Disclosed distinction, not a re-use of the same column: org_checklist_
-- dismissed_at (0003, wired Phase 10) is a PROFILE-COMPLETION nudge —
-- "fill in your remaining org fields," computed from which columns are
-- populated. §10.7 asks for something different in kind: a first-run
-- WALKTHROUGH of the app's core screens/actions for a brand-new org
-- ("Ajoutez votre premier chantier," "Ajoutez un travailleur," "Faites
-- votre premier pointage") — computed from whether real DATA exists yet
-- (a project row, a worker row, an attendance row), not from which org
-- COLUMNS are filled in. Reusing org_checklist_dismissed_at for both
-- would conflate two different \"done\" conditions behind one dismiss
-- flag — dismissing the profile-fields nudge would also silently dismiss
-- the walkthrough and vice versa. A second, parallel column, dismissed by
-- a second, near-identical RPC (same owner/manager gate, same shape) is
-- the smaller and more honest option — genuinely mirroring the PATTERN
-- (dismiss/undismiss on an org, owner/manager-gated, timestamptz column)
-- without conflating the two different things being tracked.
-- -----------------------------------------------------------------------------
alter table organizations
  add column onboarding_dismissed_at timestamptz;

comment on column organizations.onboarding_dismissed_at is
  'Phase 12 (improvement-plan §10.7). First-run guided-walkthrough dismiss
   flag — deliberately separate from org_checklist_dismissed_at (0003),
   which tracks profile-FIELD completion, not first-run-ACTION completion.
   See this migration''s Part 3 header for the full reasoning against
   reusing the existing column.';

create or replace function dismiss_org_onboarding(p_org_id uuid, p_dismissed boolean)
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
  set onboarding_dismissed_at = case when p_dismissed then now() else null end
  where id = p_org_id;
end;
$$;

comment on function dismiss_org_onboarding(uuid, boolean) is
  'Phase 12 (improvement-plan §10.7). Same shape as dismiss_org_checklist
   (0075) — owner/manager only, matching organizations_update_owner_manager
   (0005) — deliberately not a third permission mechanism, per
   docs/ARCHITECTURE.md''s "one authorization pattern" section.';

grant execute on function dismiss_org_onboarding(uuid, boolean) to authenticated;
