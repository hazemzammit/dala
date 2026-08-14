-- =============================================================================
-- 0044_free_tier_downgrade_enforcement.sql
-- Ref: docs/spec/01-data-model-security-and-architecture.md §1.13
--      docs/spec/02-features-field-ops-multi-org-and-roadmap.md §2.10
--
-- Closes the gap flagged when 0043 shipped: subscription_status could move
-- to 'past_due' but nothing actually enforced it. Decision made explicitly
-- (see chat): past_due orgs downgrade to a capped free tier rather than
-- being locked out entirely or only shown a reminder.
--
-- Free-tier limits, as given, not invented:
--   - Max 3 active projects
--   - Max 3 workers on the roster
--   - No multi-org collaboration (inviting another org to a project)
--   - No reports/export
--   - No Tier 0 lateness insights
--
-- SCOPE DECISION, stated rather than silently picked: the two count-based
-- caps (projects, workers) block NEW creation past the limit -- they do NOT
-- retroactively touch an org that already has more than 3 of either when it
-- first goes past_due (e.g. an org with 7 active projects that misses a
-- payment keeps all 7 readable/writable; it just can't create an 8th while
-- past_due). Forcibly locking/hiding existing projects or workers over the
-- cap would mean a billing hiccup silently disrupts real, already-running
-- site operations and worker records -- a materially bigger decision than
-- "block new growth," and not something to decide unilaterally inside an
-- enforcement migration. Revisit explicitly if the intent was actually a
-- hard retroactive cap.
--
-- ENFORCEMENT SHAPE: hard caps (projects, workers) are enforced at the
-- Postgres level via RESTRICTIVE policies -- new to this codebase (every
-- prior RLS policy has been PERMISSIVE, the Postgres default) -- so it's
-- worth being explicit about the mechanics: a RESTRICTIVE policy ANDs with
-- whatever PERMISSIVE policy already allows the operation, rather than
-- adding another way IN the way a second permissive policy would. This is
-- the correct primitive for "the existing owner/manager write policy must
-- ALSO satisfy this cap," not a workaround.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Predicate: is this org currently downgraded? SECURITY INVOKER, same
-- reasoning as get_org_seat_count (0043) -- organizations already has
-- correct RLS (0003/0005) for a member to read their own org's row, so this
-- needs no additional access-control logic of its own.
-- ---------------------------------------------------------------------------
create function is_org_past_due(p_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (select subscription_status = 'past_due' from organizations where id = p_org_id),
    false
  );
$$;

revoke execute on function is_org_past_due(uuid) from public;
grant execute on function is_org_past_due(uuid) to authenticated;

comment on function is_org_past_due(uuid) is
  'True if this org is currently downgraded to the free tier (0044). '
  'Returns false (not an error) for an unknown/inaccessible org_id -- a '
  'predicate function should fail closed to "no restriction" only when '
  'that is actually the safe default, which it is here since every '
  'caller of this function is already gating a WRITE, not a read.';

-- ---------------------------------------------------------------------------
-- Hard cap: max 3 active projects while past_due. Following this codebase's
-- own established convention (0038's header: "a table-lookup predicate
-- function, never a hand-rolled check inline") rather than an inline
-- subquery referencing the row being inserted -- a bare column reference
-- inside a correlated subquery inside a WITH CHECK is exactly the kind of
-- thing this repo's own RLS predicate style exists to avoid getting wrong.
-- active_projects (0013) already excludes soft-deleted rows, so a
-- soft-deleted project never counts against the cap.
-- ---------------------------------------------------------------------------
create function has_active_project_capacity(p_lead_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select (select count(*) from active_projects where lead_org_id = p_lead_org_id) < 3;
$$;

revoke execute on function has_active_project_capacity(uuid) from public;
grant execute on function has_active_project_capacity(uuid) to authenticated;

create policy "projects_free_tier_cap" on projects
  as restrictive
  for insert
  to authenticated
  with check (
    not is_org_past_due(lead_org_id)
    or has_active_project_capacity(lead_org_id)
  );

-- ---------------------------------------------------------------------------
-- Hard cap: max 3 workers on the roster while past_due. Same reasoning and
-- shape as has_active_project_capacity above. active_workers (0025)
-- already excludes soft-deleted rows.
-- ---------------------------------------------------------------------------
create function has_active_worker_capacity(p_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select (select count(*) from active_workers where org_id = p_org_id) < 3;
$$;

revoke execute on function has_active_worker_capacity(uuid) from public;
grant execute on function has_active_worker_capacity(uuid) to authenticated;

create policy "workers_free_tier_cap" on workers
  as restrictive
  for insert
  to authenticated
  with check (
    not is_org_past_due(org_id)
    or has_active_worker_capacity(org_id)
  );

comment on policy "projects_free_tier_cap" on projects is
  'Free-tier cap (0044): while past_due, blocks creating a 4th active '
  'project. RESTRICTIVE -- ANDs with projects_write_owner_manager (0006), '
  'does not grant any access on its own.';
comment on policy "workers_free_tier_cap" on workers is
  'Free-tier cap (0044): while past_due, blocks adding a 4th active '
  'worker. RESTRICTIVE -- ANDs with workers_write_owner_manager (0005), '
  'does not grant any access on its own.';

-- ---------------------------------------------------------------------------
-- Feature gate: no multi-org collaboration while past_due. Scope decision,
-- stated: this blocks the LEAD org from sending a NEW invitation while
-- past_due. It does not retroactively revoke an already-accepted trade-org
-- collaboration on a project invited before the downgrade -- same
-- "don't disrupt already-running operations" reasoning as the project/
-- worker caps above. If a trade org itself goes past_due, its existing
-- participation is likewise left alone; only that org's own ability to
-- send NEW invitations elsewhere would be affected, and this org isn't
-- the one calling invite_org_to_project in that scenario anyway.
-- ---------------------------------------------------------------------------
create or replace function invite_org_to_project(
  p_project_id uuid,
  p_invited_phone text,
  p_invited_email text,
  p_trade_type text,
  p_sent_via text
)
returns uuid language plpgsql as $$
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

  -- Dedup: re-inviting the same contact on the same project updates the
  -- existing pending row (fresh token/expiry) instead of creating a
  -- duplicate — same rule as invite_worker's re-invite behavior.
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

comment on function invite_org_to_project(uuid, text, text, text, text) is
  'Doc 02 §2.8a project-to-org invite. 0044: rejects with '
  'feature_requires_active_subscription while the LEAD org is past_due '
  '-- does not affect accepting an invitation sent before the downgrade, '
  'and does not touch any already-accepted collaboration. Gated to '
  'owner/manager of the lead org via org_role_of() (0040-style coalesce '
  'to avoid the null-bypass bug that migration fixed elsewhere).';

-- Note: the reinstated body above is IDENTICAL to 0024's original except
-- for the two additions (coalesce() around org_role_of per the 0040
-- convention, and the past_due check) -- confirmed by diffing against
-- 0024 before writing this migration, so this create-or-replace doesn't
-- silently drop or alter any other behavior of the function.

-- ---------------------------------------------------------------------------
-- Feature gate: no Tier 0 lateness insights while past_due. Rewritten from
-- `language sql` to `language plpgsql` (return type unchanged) purely to
-- allow the explicit past_due check + raise -- a single SQL query can't
-- branch. Query body below is otherwise IDENTICAL to 0025's original,
-- confirmed by diff before writing this.
-- ---------------------------------------------------------------------------
create or replace function get_worker_lateness_pattern(p_worker_id uuid)
returns table (
  day_of_week       integer,
  avg_lateness_min  numeric,
  sample_count      bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id from workers where id = p_worker_id;
  if v_org_id is null then
    raise exception 'worker_not_found';
  end if;

  if is_org_past_due(v_org_id) then
    raise exception 'feature_requires_active_subscription'
      using detail = 'Tier 0 lateness insights are not available on the free tier.';
  end if;

  return query
  select
    extract(dow from assignment_date)::integer as day_of_week,
    round(avg(extract(epoch from (actual_departure_time - departure_time)) / 60), 1) as avg_lateness_min,
    count(*) as sample_count
  from dispatch_assignments
  where worker_id = p_worker_id
    and departure_time is not null
    and actual_departure_time is not null
    and is_org_member(org_id)
  group by extract(dow from assignment_date)
  having count(*) >= 4
  order by avg_lateness_min desc;
end;
$$;

revoke execute on function get_worker_lateness_pattern(uuid) from public;
grant execute on function get_worker_lateness_pattern(uuid) to authenticated;

comment on function get_worker_lateness_pattern(uuid) is
  'Tier 0 dispatch-lateness pattern (0025). 0044: rejects with '
  'feature_requires_active_subscription while the worker''s org is '
  'past_due. Query body unchanged from 0025 otherwise.';
