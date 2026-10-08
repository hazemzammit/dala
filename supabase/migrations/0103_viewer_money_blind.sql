-- =============================================================================
-- 0103_viewer_money_blind.sql
--
-- Product decision (option B): the `viewer` (Observateur) role is a read-only
-- OBSERVER of operations, not of money. Owners and managers keep everything;
-- workers keep their own advances/salary rows (the *_select_self policies are
-- untouched). Precedent already in the schema: invoices and billing_cycles are
-- owner/manager-only for SELECT.
--
-- What viewers can no longer read (RLS returns zero rows, no error):
--   * advances, salary_cycles, project_expenses
--   * the `expense_recorded` events of org_activity_feed — those carry the
--     expense AMOUNT in metadata, so restricting the table alone would leak it
--   * get_digest_summary(): the advance count and weekly advance total come
--     back NULL for viewers
--
-- Also fixed here — a pre-existing bug found while testing the digest:
--   send-digest-notifications calls get_digest_summary() with the SERVICE ROLE,
--   where auth.uid() is NULL, so its `where is_org_member(...)` matched nothing
--   and NO digest push notification was ever sent. digest_summary_for(org, user)
--   is a service-role-only variant that takes the recipient explicitly and
--   applies the same role rules (viewer => money fields NULL).
--
-- NOT changed by this migration (deliberately; see the follow-ups):
--   * workers.daily_rate — a COLUMN of a table viewers need for the roster;
--     Postgres cannot hide a column per app-role, so it needs a separate
--     compensation table or a roster view (bigger change, next step).
--   * materials.cost, vehicle_maintenance_log.cost, projects.budget_total,
--     organizations.seat_price_millimes — operational/plan figures, not payroll.
-- =============================================================================

-- 1. Money tables ---------------------------------------------------------------
drop policy if exists advances_select_member on public.advances;
create policy advances_select_owner_manager on public.advances
  for select to public
  using (coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager'));

drop policy if exists salary_cycles_select_member on public.salary_cycles;
create policy salary_cycles_select_owner_manager on public.salary_cycles
  for select to public
  using (coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager'));

drop policy if exists project_expenses_select_member on public.project_expenses;
create policy project_expenses_select_owner_manager on public.project_expenses
  for select to public
  using (coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager'));

-- 2. Activity feed: money events are owner/manager-only ---------------------------
drop policy if exists org_activity_feed_select_member on public.org_activity_feed;
create policy org_activity_feed_select_member on public.org_activity_feed
  for select to public
  using (
    public.is_org_member(org_id)
    and (
      coalesce(public.org_role_of(org_id), 'none') in ('owner', 'manager')
      or event_type <> 'expense_recorded'
    )
  );

-- 3. Digest ---------------------------------------------------------------------
-- Recipient-explicit variant, for the service-role Edge Function.
create or replace function public.digest_summary_for(p_org_id uuid, p_user_id uuid)
returns table (
  pending_advances_count bigint,
  pending_materials_count bigint,
  tomorrow_dispatch_planned boolean,
  week_advances_total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    case when m.role in ('owner', 'manager') then
      (select count(*) from advances where org_id = p_org_id and status = 'pending')
    end,
    (select count(*) from materials where org_id = p_org_id and status = 'pending'),
    exists (
      select 1 from dispatch_assignments
      where org_id = p_org_id and assignment_date = (current_date + interval '1 day')::date
    ),
    case when m.role in ('owner', 'manager') then
      coalesce((
        select sum(amount) from advances
        where org_id = p_org_id and status = 'approved'
          and created_at >= date_trunc('week', now())
      ), 0)
    end
  from organization_members m
  where m.org_id = p_org_id and m.user_id = p_user_id;
$$;

revoke execute on function public.digest_summary_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.digest_summary_for(uuid, uuid) to service_role;

-- Caller-facing version keeps its signature; it now delegates, so the role rule
-- lives in one place.
create or replace function public.get_digest_summary(p_org_id uuid)
returns table (
  pending_advances_count bigint,
  pending_materials_count bigint,
  tomorrow_dispatch_planned boolean,
  week_advances_total numeric
)
language sql
security definer
set search_path = public
as $$
  select * from public.digest_summary_for(p_org_id, auth.uid());
$$;
