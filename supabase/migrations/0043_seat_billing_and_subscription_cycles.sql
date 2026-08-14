-- =============================================================================
-- 0043_seat_billing_and_subscription_cycles.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.13
--
-- Seat-based billing (Doc 02 §2.10 "seat-based pricing", unblocked by an
-- explicit decision: a seat = an organization_members row with
-- role in ('owner','manager') — field workers are NOT seats).
--
-- Built against an abstracted payment-provider boundary (see
-- supabase/functions/_shared/paymentProvider.ts), NOT called directly from
-- SQL: Postgres/pg_net can't hold provider SDK logic or verify webhook
-- signatures, so this migration only ever calls out to this project's own
-- Edge Functions, exactly like 0026/0027 already established for
-- send-digest-notifications. Which real provider answers a given payment
-- request is a Deno.env decision made inside the Edge Functions
-- (PAYMENT_PROVIDER = 'stripe_test' | 'konnect'), not something recorded
-- per-org in this schema -- see paymentProvider.ts's header for why.
--
-- PLACEHOLDER VALUE, FLAGGED EXPLICITLY: seat_price_millimes defaults to
-- 15000 (15.000 TND/seat/month) below purely so the column has a
-- non-null starting value for existing orgs. This number was never given
-- to me -- it is NOT a pricing decision, just a placeholder. Change it
-- directly in the database (or add an admin screen for it) before this
-- ever charges anyone for real.
-- =============================================================================

alter table organizations
  add column subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled')),
  add column billing_cycle_start date not null default current_date,
  add column seat_price_millimes integer not null default 15000;

comment on column organizations.subscription_status is
  'trialing = never billed yet; active = current cycle paid; past_due = a '
  'generated billing_cycles row went unpaid past its cycle_end; canceled = '
  'owner turned off billing. Doc 02 §2.10, added 0043.';
comment on column organizations.seat_price_millimes is
  'Price per seat (owner/manager account) per billing cycle, in millimes '
  '(1 TND = 1000 millimes, integer to avoid float rounding on money). '
  'PLACEHOLDER default -- see this migration''s header.';

-- ---------------------------------------------------------------------------
-- Seat count: computed live, not tracked in a separate column. A seat is an
-- organization_members row with role owner/manager (0003) -- counting it live
-- means promoting/demoting a member is automatically correct with no sync
-- step, at the cost of re-counting on each billing-cycle generation (cheap;
-- organization_members per org is a handful of rows, never a hot path).
-- SECURITY INVOKER deliberately, not DEFINER: organization_members already
-- has correct RLS (0005) restricting reads to a caller's own org membership,
-- so this function needs no additional access-control logic of its own --
-- it simply inherits the caller's existing, correct row visibility. A
-- non-member calling this for someone else's org_id gets 0, not an error and
-- not another org's real count.
-- ---------------------------------------------------------------------------
create function get_org_seat_count(p_org_id uuid)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from organization_members
  where org_id = p_org_id
    and role in ('owner', 'manager');
$$;

revoke execute on function get_org_seat_count(uuid) from public;
grant execute on function get_org_seat_count(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- billing_cycles: one row per generated charge attempt. service_role-only
-- writes (only generate-subscription-charges / payment-webhook ever insert
-- or update a row) -- mirrors scheduled_job_runs' (0010) own "only Edge
-- Functions touch this directly" convention. Owner/manager can read their
-- own org's rows (so billing.tsx can show real history), matching the
-- owner/manager-only read pattern billing-adjacent data already uses
-- elsewhere in this schema.
-- ---------------------------------------------------------------------------
create table billing_cycles (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  cycle_start       date not null,
  cycle_end         date not null,
  seat_count        integer not null,
  amount_millimes   integer not null,
  payment_provider  text not null,
  external_ref      text,
  payment_url       text,
  status            text not null default 'pending'
                      check (status in ('pending', 'paid', 'failed', 'expired')),
  created_at        timestamptz not null default now(),
  paid_at           timestamptz
);

comment on table billing_cycles is
  'One row per generated seat-billing charge attempt (Doc 02 §2.10, added '
  '0043). Written only by generate-subscription-charges (creates, pending) '
  'and payment-webhook (updates to paid/failed) -- never directly by a '
  'client. external_ref is the payment-provider''s own reference '
  '(Stripe PaymentIntent id in test mode, Konnect paymentRef in production) '
  'used to match an inbound webhook back to this row.';

create index billing_cycles_org_id_idx on billing_cycles (org_id, created_at desc);
create unique index billing_cycles_external_ref_idx on billing_cycles (external_ref)
  where external_ref is not null;

alter table billing_cycles enable row level security;

create policy billing_cycles_select_owner_manager on billing_cycles
  for select
  to authenticated
  using (coalesce(org_role_of(org_id), 'none') in ('owner', 'manager'));

-- No insert/update/delete policy for authenticated on purpose: only
-- service_role (Edge Functions, which bypass RLS) ever writes this table.

revoke all on billing_cycles from public, anon;
grant select on billing_cycles to authenticated;
grant all on billing_cycles to service_role;

-- ---------------------------------------------------------------------------
-- Cron wiring -- identical shape to 0026/0027's send-digest-notifications
-- wiring, reusing the SAME two Vault secrets already registered for that job
-- (project_url, service_role_key). No new secret needed for the cron call
-- itself; PAYMENT_PROVIDER/STRIPE_*/KONNECT_* secrets are read separately,
-- inside the Edge Functions themselves, per paymentProvider.ts's header.
--
-- Runs once daily; generate-subscription-charges decides internally which
-- orgs are actually due (billing_cycle_start + 1 month <= current_date),
-- same "trigger daily, let the function decide who needs it" shape
-- send-digest-notifications already uses.
-- ---------------------------------------------------------------------------
select
  cron.schedule(
    'generate-subscription-charges-daily',
    '0 6 * * *', -- 06:00 UTC = 07:00 Tunis time, one hour after the digest job
    $$
    select
      net.http_post(
        url := (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'project_url'
        ) || '/functions/v1/generate-subscription-charges',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'service_role_key'
          )
        ),
        body := '{}'::jsonb
      );
    $$
  );
