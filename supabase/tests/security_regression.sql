-- =============================================================================
-- supabase/tests/security_regression.sql
--
-- Self-contained security regression suite for the fixes in migrations
-- 0093-0111 + Edge Function guards (see each migration header for the finding it
-- closes). Runs in ONE transaction that is always rolled back, with its own
-- fixtures (ids prefixed 5ec0…, emails @example.invalid), so it is safe against
-- a seeded database.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_regression.sql
--
-- Exit status is non-zero (and the failing cases are printed) if any case fails.
-- Each case impersonates a role/user the way PostgREST does (SET LOCAL ROLE +
-- request.jwt.claims) and asserts the outcome:
--   perm   -> must fail with 42501 permission denied / RLS violation (attack blocked
--             at the privilege layer; pins the exact mechanism)
--   deny   -> must raise some other refusal (RPC's own authorization error, FK or
--             CHECK violation); typo-class errors (unknown function/column) never count
--   ok     -> the statement must succeed                  (legitimate use kept)
--   reach  -> must NOT fail with 42501 (function callable; may raise its own
--             business error)
--   check  -> a multi-step scenario; passes if its DO block completes
-- Add a case whenever a new security-relevant rule ships.
-- =============================================================================
begin;

create temp table results (label text, expect text, result text);

create function pg_temp.run_case(p_label text, p_expect text, p_role text, p_sub uuid, p_sql text)
returns void language plpgsql as $f$
declare res text := 'EXECUTED';
begin
  begin
    reset role;
    perform set_config('request.jwt.claims',
      case when p_sub is null then json_build_object('role', p_role)::text
           else json_build_object('sub', p_sub, 'role', p_role)::text end, true);
    execute 'set local role ' || quote_ident(p_role);
    execute p_sql;
    raise exception using errcode = 'ROLLB';
  exception when others then
    if sqlstate <> 'ROLLB' then res := 'ERR ' || sqlstate || ' ' || left(sqlerrm, 70); end if;
  end;
  insert into pg_temp.results values (p_label, p_expect, res);
end $f$;

create function pg_temp.run_check(p_label text, p_body text)
returns void language plpgsql as $f$
declare res text := 'EXECUTED';
begin
  begin
    reset role;
    execute 'do $chk$ begin ' || p_body || ' end $chk$';
    raise exception using errcode = 'ROLLB';
  exception when others then
    if sqlstate <> 'ROLLB' then res := 'ERR ' || sqlstate || ' ' || left(sqlerrm, 200); end if;
  end;
  insert into pg_temp.results values (p_label, 'check', res);
end $f$;

-- ---------------------------------------------------------------- fixtures

insert into auth.users (id, email) values
  ('5ec0a000-0000-4000-8000-000000000010','owner-a@example.invalid'), ('5ec0a000-0000-4000-8000-000000000011','manager-a@example.invalid'),
  ('5ec0a000-0000-4000-8000-000000000012','viewer-a@example.invalid'), ('5ec0a000-0000-4000-8000-000000000013','worker-a@example.invalid'),
  ('5ec0b000-0000-4000-8000-000000000010','owner-b@example.invalid'), ('5ec0c000-0000-4000-8000-000000000010','outsider@example.invalid'),
  -- 0112: one account in TWO orgs (manager of A, viewer of B). Must be a
  -- top-level fixture, not created inside a run_check body: run_check wraps its
  -- body in a subtransaction that is rolled back when it raises its sentinel
  -- error, so anything inserted there never exists for the cases that follow.
  ('5ec0a000-0000-4000-8000-000000000014','dual-a@example.invalid');
insert into organizations (id, name, created_by) values
  ('5ec0a000-0000-4000-8000-000000000001','SecTest Org A','5ec0a000-0000-4000-8000-000000000010'), ('5ec0b000-0000-4000-8000-000000000001','SecTest Org B','5ec0b000-0000-4000-8000-000000000010');
insert into organization_members (org_id, user_id, role) values
  ('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000010','owner'), ('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000011','manager'), ('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012','viewer'),
  ('5ec0b000-0000-4000-8000-000000000001','5ec0b000-0000-4000-8000-000000000010','owner'),
  -- 0112 attacker: a manager of Org A who is ALSO a plain member of Org B.
  -- Every other fixture user belongs to exactly one org, which is precisely why
  -- the caller-scoped participation check looked airtight until this one.
  ('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000014','manager'),
  ('5ec0b000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000014','viewer');
insert into workers (id, org_id, full_name, daily_rate, user_id) values
  ('5ec0d000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001','Worker A1',100,'5ec0a000-0000-4000-8000-000000000013'), ('5ec0d000-0000-4000-8000-000000000002','5ec0a000-0000-4000-8000-000000000001','Worker A2',150,null),
  ('5ec0d000-0000-4000-8000-000000000003','5ec0b000-0000-4000-8000-000000000001','Worker B1',120,null);
insert into projects (id, lead_org_id, name, created_by) values
  ('5ec0e000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001','SecTest Project A','5ec0a000-0000-4000-8000-000000000010'), ('5ec0e000-0000-4000-8000-000000000002','5ec0b000-0000-4000-8000-000000000001','SecTest Project B','5ec0b000-0000-4000-8000-000000000010'),
  -- 0112: a second Org B project, on which Org A has no participation at all
  -- and Org B is the sole participant. Dedicated to the attack cases so they
  -- cannot be perturbed by whatever any other case does to Project B.
  ('5ec0e000-0000-4000-8000-000000000003','5ec0b000-0000-4000-8000-000000000001','SecTest Project B2','5ec0b000-0000-4000-8000-000000000010');
insert into project_memberships (project_id, org_id, role) values ('5ec0e000-0000-4000-8000-000000000001','5ec0b000-0000-4000-8000-000000000001','trade');
insert into vehicles (id, org_id, name, capacity) values
  ('5ec0f000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001','Truck A',2), ('5ec0f000-0000-4000-8000-000000000002','5ec0b000-0000-4000-8000-000000000001','Truck B',2);
insert into dispatch_assignments (id, org_id, project_id, worker_id, vehicle_id, assignment_date) values
  ('5ec09000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001','5ec0f000-0000-4000-8000-000000000001', current_date);
insert into site_logs (id, org_id, project_id, note_text, logged_by) values
  ('5ec09000-0000-4000-8000-000000000002','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','fixture log','5ec0a000-0000-4000-8000-000000000010');
insert into materials (id, org_id, project_id, item, quantity, status, created_by, cost) values
  ('5ec09000-0000-4000-8000-000000000003','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','cement',10,'pending','5ec0a000-0000-4000-8000-000000000010',50);
insert into advances (id, org_id, worker_id, amount, status) values
  ('5ec09000-0000-4000-8000-000000000031','5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',100,'approved'), ('5ec09000-0000-4000-8000-000000000032','5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',200,'pending');
insert into salary_cycles (id, org_id, worker_id, cycle_start, cycle_end) values
  ('5ec09000-0000-4000-8000-000000000033','5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date-14,current_date-1), ('5ec09000-0000-4000-8000-000000000034','5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',current_date-14,current_date-1);
insert into project_expenses (id, org_id, project_id, category, amount, created_by) values
  ('5ec09000-0000-4000-8000-000000000035','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','carburant',75,'5ec0a000-0000-4000-8000-000000000010');
insert into vehicles (id, org_id, name, capacity) values ('5ec0f000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001','Camion 1',2) on conflict (id) do nothing;
insert into vehicle_maintenance_log (id, org_id, vehicle_id, log_date, description, cost, logged_by) values
  ('5ec09000-0000-4000-8000-000000000036','5ec0a000-0000-4000-8000-000000000001','5ec0f000-0000-4000-8000-000000000001',current_date,'Vidange',80,'5ec0a000-0000-4000-8000-000000000010');
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'organization_rib_encryption_key_v1') then
    perform vault.create_secret('test-only-key-material', 'organization_rib_encryption_key_v1');
  end if;
end $$;

-- 0093 — fail-open role checks: outsiders and anon must be refused by all 15 RPCs

select pg_temp.run_case('0093 outsider cannot promote a viewer to owner', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_member_role('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012','owner')$q$);
select pg_temp.run_case('0093 anon cannot promote a viewer to owner', 'perm', 'anon', null, $q$select update_organization_member_role('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012','owner')$q$);
select pg_temp.run_case('0093 outsider cannot remove the real owner', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select remove_organization_member('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000010')$q$);
select pg_temp.run_case('0093 anon cannot remove the real owner', 'perm', 'anon', null, $q$select remove_organization_member('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000010')$q$);
select pg_temp.run_case('0093 outsider cannot rename the org', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_profile('5ec0a000-0000-4000-8000-000000000001','HACKED',null,null,null,null,null,null,null)$q$);
select pg_temp.run_case('0093 anon cannot rename the org', 'perm', 'anon', null, $q$select update_organization_profile('5ec0a000-0000-4000-8000-000000000001','HACKED',null,null,null,null,null,null,null)$q$);
select pg_temp.run_case('0093 outsider cannot overwrite the RIB', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_rib('5ec0a000-0000-4000-8000-000000000001','12345678901234567890')$q$);
select pg_temp.run_case('0093 anon cannot overwrite the RIB', 'perm', 'anon', null, $q$select update_organization_rib('5ec0a000-0000-4000-8000-000000000001','12345678901234567890')$q$);
select pg_temp.run_case('0093 outsider cannot edit the extended profile', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_extended_profile('5ec0a000-0000-4000-8000-000000000001','x','x','x','x','x','x')$q$);
select pg_temp.run_case('0093 anon cannot edit the extended profile', 'perm', 'anon', null, $q$select update_organization_extended_profile('5ec0a000-0000-4000-8000-000000000001','x','x','x','x','x','x')$q$);
select pg_temp.run_case('0093 outsider cannot request verification', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select request_org_verification('5ec0a000-0000-4000-8000-000000000001')$q$);
select pg_temp.run_case('0093 anon cannot request verification', 'perm', 'anon', null, $q$select request_org_verification('5ec0a000-0000-4000-8000-000000000001')$q$);
select pg_temp.run_case('0093 outsider cannot dismiss the checklist', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select dismiss_org_checklist('5ec0a000-0000-4000-8000-000000000001',true)$q$);
select pg_temp.run_case('0093 anon cannot dismiss the checklist', 'perm', 'anon', null, $q$select dismiss_org_checklist('5ec0a000-0000-4000-8000-000000000001',true)$q$);
select pg_temp.run_case('0093 outsider cannot dismiss onboarding', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select dismiss_org_onboarding('5ec0a000-0000-4000-8000-000000000001',true)$q$);
select pg_temp.run_case('0093 anon cannot dismiss onboarding', 'perm', 'anon', null, $q$select dismiss_org_onboarding('5ec0a000-0000-4000-8000-000000000001',true)$q$);
select pg_temp.run_case('0093 outsider cannot create an advance', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select create_advance('5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',100,'x',gen_random_uuid())$q$);
select pg_temp.run_case('0093 anon cannot create an advance', 'perm', 'anon', null, $q$select create_advance('5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',100,'x',gen_random_uuid())$q$);
select pg_temp.run_case('0093 outsider cannot create an invoice', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select create_invoice('5ec0e000-0000-4000-8000-000000000001',current_date,current_date,current_date,'x')$q$);
select pg_temp.run_case('0093 anon cannot create an invoice', 'perm', 'anon', null, $q$select create_invoice('5ec0e000-0000-4000-8000-000000000001',current_date,current_date,current_date,'x')$q$);
select pg_temp.run_case('0093 outsider cannot approve a material request', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select approve_material_request('5ec09000-0000-4000-8000-000000000003',gen_random_uuid())$q$);
select pg_temp.run_case('0093 anon cannot approve a material request', 'perm', 'anon', null, $q$select approve_material_request('5ec09000-0000-4000-8000-000000000003',gen_random_uuid())$q$);
select pg_temp.run_case('0093 outsider cannot edit a site log caption', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select update_site_log_caption('5ec09000-0000-4000-8000-000000000002','x')$q$);
select pg_temp.run_case('0093 anon cannot edit a site log caption', 'perm', 'anon', null, $q$select update_site_log_caption('5ec09000-0000-4000-8000-000000000002','x')$q$);
select pg_temp.run_case('0093 outsider cannot soft-delete a site log', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select soft_delete_site_log('5ec09000-0000-4000-8000-000000000002')$q$);
select pg_temp.run_case('0093 anon cannot soft-delete a site log', 'perm', 'anon', null, $q$select soft_delete_site_log('5ec09000-0000-4000-8000-000000000002')$q$);
select pg_temp.run_case('0093 outsider cannot restore a site log', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select restore_site_log('5ec09000-0000-4000-8000-000000000002')$q$);
select pg_temp.run_case('0093 anon cannot restore a site log', 'perm', 'anon', null, $q$select restore_site_log('5ec09000-0000-4000-8000-000000000002')$q$);
select pg_temp.run_case('0093 outsider cannot submit a site log entry', 'deny', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select submit_site_log_entry('5ec0e000-0000-4000-8000-000000000001','x','x','x','x',null,null,null,null,now(),'k-'||gen_random_uuid())$q$);
select pg_temp.run_case('0093 anon cannot submit a site log entry', 'perm', 'anon', null, $q$select submit_site_log_entry('5ec0e000-0000-4000-8000-000000000001','x','x','x','x',null,null,null,null,now(),'k-'||gen_random_uuid())$q$);
select pg_temp.run_case('0093 owner promotes viewer to manager', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_member_role('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012','manager')$q$);
select pg_temp.run_case('0093 manager updates the org profile', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$select update_organization_profile('5ec0a000-0000-4000-8000-000000000001','Renamed',null,null,null,null,null,null,null)$q$);
select pg_temp.run_case('0093 manager dismisses onboarding', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$select dismiss_org_onboarding('5ec0a000-0000-4000-8000-000000000001',true)$q$);
select pg_temp.run_case('0093 manager creates an advance', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$select create_advance('5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',100,'legit',gen_random_uuid())$q$);
select pg_temp.run_case('0093 manager creates an invoice', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$select create_invoice('5ec0e000-0000-4000-8000-000000000001',current_date,current_date,current_date,'x')$q$);
select pg_temp.run_case('0093 viewer cannot rename the org', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$select update_organization_profile('5ec0a000-0000-4000-8000-000000000001','nope',null,null,null,null,null,null,null)$q$);
select pg_temp.run_case('0093 manager cannot change roles', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$select update_organization_member_role('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012','owner')$q$);
select pg_temp.run_case('0093 manager cannot overwrite the RIB', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$select update_organization_rib('5ec0a000-0000-4000-8000-000000000001','12345678901234567890')$q$);
select pg_temp.run_case('0093 owner can set the RIB (RPC uses the vault key internally)', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_rib('5ec0a000-0000-4000-8000-000000000001','12345678901234567890')$q$);
select pg_temp.run_case('0093 new user can create an org and edit its profile', 'ok', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$do $x$ declare o uuid; begin o := create_organization_for_current_user('Fresh','x'); perform update_organization_profile(o,'Fresh 2',null,null,null,null,null,null,null); end $x$$q$);

-- 0094 — RIB key, ciphertext column, RLS-less tables

select pg_temp.run_case('0094 anon cannot fetch the RIB key', 'perm', 'anon', null, $q$select organization_get_rib_encryption_key()$q$);
select pg_temp.run_case('0094 outsider cannot fetch the RIB key', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select organization_get_rib_encryption_key()$q$);
select pg_temp.run_case('0094 viewer cannot fetch the RIB key', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$select organization_get_rib_encryption_key()$q$);
select pg_temp.run_case('0094 owner cannot fetch the RIB key directly', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select organization_get_rib_encryption_key()$q$);
select pg_temp.run_case('0094 viewer cannot read rib_encrypted', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$select rib_encrypted from organizations$q$);
select pg_temp.run_case('0094 owner cannot read rib_encrypted', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select rib_encrypted from organizations$q$);
select pg_temp.run_case('0094 viewer still reads normal org columns', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$select id, name, plan, subscription_status, rib_last4, verification_status from organizations$q$);
select pg_temp.run_case('0094 outsider cannot wipe the rate limiter', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$delete from edge_function_rate_limits$q$);
select pg_temp.run_case('0094 outsider cannot read the rate limiter', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$select * from edge_function_rate_limits$q$);
select pg_temp.run_case('0094 outsider cannot rewrite the TOTP key version', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$update totp_encryption_key_state set current_version='v999'$q$);
select pg_temp.run_case('0094 service_role still uses check_rate_limit', 'ok', 'service_role', null, $q$select check_rate_limit('sec-test',5,60)$q$);

-- 0095 — column-level write grants on organizations / profiles

select pg_temp.run_case('0095 manager cannot set plan=enterprise', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update organizations set plan='enterprise' where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 manager cannot set subscription_status=active', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update organizations set subscription_status='active' where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 manager cannot zero the seat price', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update organizations set seat_price_millimes=0 where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 manager cannot self-verify the org', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update organizations set verification_status='verified' where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 manager cannot overwrite rib_last4', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update organizations set rib_last4='9999' where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 manager cannot clear suspended_at', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update organizations set suspended_at=null where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 OWNER cannot edit the organizations table directly', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$update organizations set name='x' where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 user cannot INSERT an org with plan=enterprise', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$insert into organizations(name,plan,created_by) values ('evil','enterprise','5ec0c000-0000-4000-8000-000000000010')$q$);
select pg_temp.run_case('0095 owner cannot DELETE the org', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$delete from organizations where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 user cannot clear own suspended_at', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set suspended_at=null where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 user cannot forge email_verified_at', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set email_verified_at=now() where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 user cannot point active_org_id at a foreign org', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set active_org_id='5ec0b000-0000-4000-8000-000000000001' where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 outsider cannot point active_org_id at org A', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$update profiles set active_org_id='5ec0a000-0000-4000-8000-000000000001' where id='5ec0c000-0000-4000-8000-000000000010'$q$);
select pg_temp.run_case('0095 user can update full_name', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set full_name='New Name' where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 user can update avatar_url', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set avatar_url='p/a.png' where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 user can update emergency contact', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set emergency_contact_name='n', emergency_contact_phone='+21600000000' where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 user can update notification_prefs', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set notification_prefs='{}'::jsonb where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 user can update expo_push_token', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$update profiles set expo_push_token='ExponentPushToken[x]' where id='5ec0a000-0000-4000-8000-000000000012'$q$);
select pg_temp.run_case('0095 org switcher: active_org_id -> own org', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$update profiles set active_org_id='5ec0a000-0000-4000-8000-000000000001' where id='5ec0a000-0000-4000-8000-000000000010'$q$);
select pg_temp.run_case('0095 worker (no membership row) can set active_org -> employer', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update profiles set active_org_id='5ec0a000-0000-4000-8000-000000000001' where id='5ec0a000-0000-4000-8000-000000000013'$q$);
select pg_temp.run_case('0095 service_role can update billing state', 'ok', 'service_role', null, $q$update organizations set plan='pro', subscription_status='active' where id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0095 service_role can soft-delete an org', 'ok', 'service_role', null, $q$select soft_delete_organization('5ec0b000-0000-4000-8000-000000000001')$q$);
select pg_temp.run_case('0095 service_role can set profiles.suspended_at', 'ok', 'service_role', null, $q$update profiles set suspended_at=now() where id='5ec0a000-0000-4000-8000-000000000012'$q$);

-- 0098 — membership / attendance / dispatch write scope

select pg_temp.run_case('0098 owner cannot INSERT a member directly', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$insert into organization_members(org_id,user_id,role) values ('5ec0a000-0000-4000-8000-000000000001','5ec0c000-0000-4000-8000-000000000010','manager')$q$);
select pg_temp.run_case('0098 owner cannot demote self directly', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$update organization_members set role='viewer' where org_id='5ec0a000-0000-4000-8000-000000000001' and user_id='5ec0a000-0000-4000-8000-000000000010'$q$);
select pg_temp.run_case('0098 owner cannot delete self (last owner) directly', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$delete from organization_members where org_id='5ec0a000-0000-4000-8000-000000000001' and user_id='5ec0a000-0000-4000-8000-000000000010'$q$);
select pg_temp.run_case('0098 owner can remove a viewer via the RPC', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select remove_organization_member('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012')$q$);
select pg_temp.run_case('0098 last owner cannot demote self via the RPC', 'deny', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select update_organization_member_role('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000010','viewer')$q$);
select pg_temp.run_case('0098 last owner cannot remove self via the RPC', 'deny', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select remove_organization_member('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000010')$q$);
select pg_temp.run_case('0098 members can still read the roster', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$select count(*) from organization_members where org_id='5ec0a000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 viewer cannot insert attendance', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date,'present','manual_pointage')$q$);
select pg_temp.run_case('0098 manager can insert attendance for an own-org worker', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',current_date,'present','manual_pointage')$q$);
select pg_temp.run_case('0098 manager cannot name another org''s worker', 'deny', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000003',current_date,'present','manual_pointage')$q$);
select pg_temp.run_case('0098 manager cannot stamp a foreign org_id', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0b000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date,'present','manual_pointage')$q$);
select pg_temp.run_case('0098 worker self check-in (today)', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date,'present','dispatch_checkin')$q$);
select pg_temp.run_case('0098 worker self check-in synced 10 days late', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date - 10,'present','dispatch_checkin')$q$);
select pg_temp.run_case('0098 worker self check-in synced 200 days late (must not wedge sync)', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date - 200,'present','dispatch_checkin')$q$);
select pg_temp.run_case('0098 worker check-in stamped with a foreign org_id', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0b000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date,'present','dispatch_checkin')$q$);
select pg_temp.run_case('0098 worker check-in dated 30 days ahead', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date + 30,'present','dispatch_checkin')$q$);
select pg_temp.run_case('0098 worker cannot check in another worker', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into attendance_records(id,org_id,worker_id,record_date,status,source) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',current_date,'present','dispatch_checkin')$q$);
select pg_temp.run_case('0098 worker sets actual_departure_time', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set actual_departure_time='07:30' where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker sets confirmation_channel', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set confirmation_channel='whatsapp' where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker sync-style full-row update (+version)', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set org_id=org_id, project_id=project_id, vehicle_id=vehicle_id, worker_id=worker_id, assignment_date=assignment_date, actual_departure_time='07:45', version=version+1 where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker cannot move the assignment date', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set assignment_date=current_date+3 where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker cannot change the project', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set project_id=null where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker cannot swap the vehicle', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set vehicle_id=null where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker cannot reassign to another worker', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set worker_id='5ec0d000-0000-4000-8000-000000000002' where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 worker cannot rewrite the planned departure_time', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$update dispatch_assignments set departure_time='03:00' where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 manager can reschedule an assignment', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$update dispatch_assignments set assignment_date=current_date+1 where id='5ec09000-0000-4000-8000-000000000001'$q$);
select pg_temp.run_case('0098 manager can create for own worker + vehicle', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into dispatch_assignments(org_id,project_id,worker_id,vehicle_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002','5ec0f000-0000-4000-8000-000000000001',current_date)$q$);
select pg_temp.run_case('0098 manager cannot dispatch another org''s worker', 'deny', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000003',current_date)$q$);
select pg_temp.run_case('0098 manager cannot use another org''s vehicle', 'deny', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into dispatch_assignments(org_id,project_id,worker_id,vehicle_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002','5ec0f000-0000-4000-8000-000000000002',current_date)$q$);
select pg_temp.run_case('0098 service_role can change any dispatch column', 'ok', 'service_role', null, $q$update dispatch_assignments set project_id=null, assignment_date=current_date+9 where id='5ec09000-0000-4000-8000-000000000001'$q$);

-- 0100 — anonymous callers cannot reach privileged RPCs; pre-login RPCs still work

select pg_temp.run_case('0100 anon cannot call approve_advance', 'perm', 'anon', null, $q$select approve_advance(gen_random_uuid(), gen_random_uuid(), 'x')$q$);
select pg_temp.run_case('0100 anon cannot call mark_salary_cycle_paid', 'perm', 'anon', null, $q$select mark_salary_cycle_paid(gen_random_uuid(), gen_random_uuid(), 'x')$q$);
select pg_temp.run_case('0100 anon cannot call set_client_portal_pin', 'perm', 'anon', null, $q$select set_client_portal_pin(gen_random_uuid(), '1234')$q$);
select pg_temp.run_case('0100 anon cannot call generate_client_portal_link', 'perm', 'anon', null, $q$select generate_client_portal_link(gen_random_uuid())$q$);
select pg_temp.run_case('0100 anon cannot call list_own_sessions', 'perm', 'anon', null, $q$select list_own_sessions()$q$);
select pg_temp.run_case('0100 anon cannot call soft_delete_organization', 'perm', 'anon', null, $q$select soft_delete_organization(gen_random_uuid())$q$);
select pg_temp.run_case('0100 anon can still reach health_check', 'reach', 'anon', null, $q$select health_check()$q$);
select pg_temp.run_case('0100 anon can still reach verify_client_portal_access', 'reach', 'anon', null, $q$select verify_client_portal_access('nope','0000')$q$);
select pg_temp.run_case('0100 anon can still reach get_worker_invitation_by_token', 'reach', 'anon', null, $q$select get_worker_invitation_by_token('nope')$q$);
select pg_temp.run_case('0100 anon can still reach get_organization_member_invitation_by_token', 'reach', 'anon', null, $q$select get_organization_member_invitation_by_token('nope')$q$);
select pg_temp.run_case('0100 authenticated keeps list_own_sessions', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select list_own_sessions()$q$);
select pg_temp.run_case('0100 authenticated keeps get_org_member_profiles', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select * from get_org_member_profiles('5ec0a000-0000-4000-8000-000000000001')$q$);

-- 0101 — storage: uploads by role

select pg_temp.run_case('0101 viewer cannot upload into the org folder', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000012'::uuid, $q$insert into storage.objects(bucket_id,name) values ('org-files','5ec0a000-0000-4000-8000-000000000001/site-logs/v.jpg')$q$);
select pg_temp.run_case('0101 worker (no membership row) can upload a site-log photo', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000013'::uuid, $q$insert into storage.objects(bucket_id,name) values ('org-files','5ec0a000-0000-4000-8000-000000000001/site-logs/w.jpg')$q$);
select pg_temp.run_case('0101 manager can upload', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into storage.objects(bucket_id,name) values ('org-files','5ec0a000-0000-4000-8000-000000000001/expenses/m.jpg')$q$);
select pg_temp.run_case('0101 outsider cannot upload into another org''s folder', 'perm', 'authenticated', '5ec0c000-0000-4000-8000-000000000010'::uuid, $q$insert into storage.objects(bucket_id,name) values ('org-files','5ec0a000-0000-4000-8000-000000000001/site-logs/x.jpg')$q$);
select pg_temp.run_case('0101 org B owner cannot upload into org A''s folder', 'perm', 'authenticated', '5ec0b000-0000-4000-8000-000000000010'::uuid, $q$insert into storage.objects(bucket_id,name) values ('org-files','5ec0a000-0000-4000-8000-000000000001/site-logs/y.jpg')$q$);

-- Multi-step scenarios

select pg_temp.run_check('0101 storage path injection: attacker cannot read another org''s private file (both layers)', $b$
declare evil uuid; pe uuid := gen_random_uuid(); leaked int; acc text;
begin
  insert into storage.objects(bucket_id,name) values ('org-files','5ec0b000-0000-4000-8000-000000000001/private/secret-b.pdf');
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  evil := create_organization_for_current_user('Evil Org','x');
  insert into projects(id,lead_org_id,created_by,name) values (pe, evil, '5ec0c000-0000-4000-8000-000000000010', 'evil project');
  insert into project_memberships(project_id,org_id,role) values (pe, evil, 'lead');
  begin  -- layer 1: fabricated log pointing at the victim's path
    insert into site_logs(id,org_id,project_id,photo_url,logged_by) values (gen_random_uuid(), evil, pe, '5ec0b000-0000-4000-8000-000000000001/private/secret-b.pdf', '5ec0c000-0000-4000-8000-000000000010');
    acc := 'accepted';
  exception when check_violation then acc := 'rejected'; end;
  if acc <> 'rejected' then raise exception 'layer 1: fabricated site_log was accepted'; end if;
  reset role;  -- layer 2: simulate a legacy row that predates the CHECK
  alter table site_logs drop constraint site_logs_file_paths_in_own_org;
  insert into site_logs(id,org_id,project_id,photo_url,logged_by) values (gen_random_uuid(), evil, pe, '5ec0b000-0000-4000-8000-000000000001/private/secret-b.pdf', '5ec0c000-0000-4000-8000-000000000010');
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into leaked from storage.objects where name = '5ec0b000-0000-4000-8000-000000000001/private/secret-b.pdf';
  if leaked > 0 then raise exception 'LEAK: attacker can read the victim org private file'; end if;
end;$b$);
select pg_temp.run_check('0101 legitimate sharing: trade partner reads the lead org''s shared log file but not unshared files', $b$
declare shared int; unshared int;
begin
  insert into storage.objects(bucket_id,name) values ('org-files','5ec0a000-0000-4000-8000-000000000001/site-logs/legit.jpg'), ('org-files','5ec0a000-0000-4000-8000-000000000001/private-unshared.pdf');
  update site_logs set photo_url = '5ec0a000-0000-4000-8000-000000000001/site-logs/legit.jpg' where id = '5ec09000-0000-4000-8000-000000000002';
  perform set_config('request.jwt.claims', '{"sub":"5ec0b000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into shared from storage.objects where name = '5ec0a000-0000-4000-8000-000000000001/site-logs/legit.jpg';
  select count(*) into unshared from storage.objects where name = '5ec0a000-0000-4000-8000-000000000001/private-unshared.pdf';
  if shared = 0 then raise exception 'sharing broken: partner cannot read the shared log file'; end if;
  if unshared > 0 then raise exception 'LEAK: partner can read an unshared file'; end if;
end;$b$);
select pg_temp.run_check('0101 site_logs cannot reference paths outside their own org', $b$
begin
  begin
    insert into site_logs(id,org_id,project_id,photo_url,logged_by) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0b000-0000-4000-8000-000000000001/private/secret-b.pdf','5ec0a000-0000-4000-8000-000000000010');
    raise exception 'insert with a foreign-org path was accepted';
  exception when check_violation then null; end;
  insert into site_logs(id,org_id,project_id,photo_url,logged_by) values (gen_random_uuid(),'5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001/site-logs/own.jpg','5ec0a000-0000-4000-8000-000000000010');
end;$b$);
select pg_temp.run_check('0097 tombstones: deletes of synced tables are recorded; blocked deletes are not', $b$
declare n int;
begin
  insert into materials(id,org_id,project_id,item,quantity,status) values ('5ec09000-0000-4000-8000-000000000020','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','tmp',1,'pending');
  delete from materials where id = '5ec09000-0000-4000-8000-000000000020';
  select count(*) into n from sync_tombstones where record_id = '5ec09000-0000-4000-8000-000000000020' and table_name = 'materials' and org_id = '5ec0a000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'materials delete wrote % tombstones', n; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  delete from dispatch_assignments where id = '5ec09000-0000-4000-8000-000000000001';
  reset role;
  select count(*) into n from sync_tombstones where record_id = '5ec09000-0000-4000-8000-000000000001' and table_name = 'dispatch_assignments';
  if n <> 1 then raise exception 'manager dispatch delete wrote % tombstones', n; end if;
  insert into dispatch_assignments(id,org_id,project_id,worker_id,assignment_date) values ('5ec09000-0000-4000-8000-000000000021','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',current_date);
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';
  delete from dispatch_assignments where id = '5ec09000-0000-4000-8000-000000000021';
  reset role;
  select count(*) into n from sync_tombstones where record_id = '5ec09000-0000-4000-8000-000000000021';
  if n <> 0 then raise exception 'blocked worker delete still wrote a tombstone'; end if;
end;$b$);
select pg_temp.run_check('0097 tombstones: visibility follows org membership (member + worker yes, outsider/other org no)', $b$
declare n int;
begin
  insert into sync_tombstones(table_name, record_id, org_id) values ('materials', gen_random_uuid(), '5ec0a000-0000-4000-8000-000000000001');
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';  select count(*) into n from sync_tombstones where org_id = '5ec0a000-0000-4000-8000-000000000001';
  if n = 0 then raise exception 'worker cannot see own-org tombstones'; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';  select count(*) into n from sync_tombstones;
  if n <> 0 then raise exception 'outsider sees % tombstones', n; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0b000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';  select count(*) into n from sync_tombstones where org_id = '5ec0a000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'another org sees tombstones'; end if;
end;$b$);
select pg_temp.run_check('0099 audit: role change is recorded with actor, org and from/to', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  perform update_organization_member_role('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012','manager');
  reset role;
  select count(*) into n from audit_log where action = 'organization_members.update' and actor_id = '5ec0a000-0000-4000-8000-000000000010'
     and actor_type = 'user' and org_id = '5ec0a000-0000-4000-8000-000000000001'
     and metadata->'changed'->'role'->>'from' = 'viewer' and metadata->'changed'->'role'->>'to' = 'manager';
  if n <> 1 then raise exception 'role change audit rows: %', n; end if;
end;$b$);
select pg_temp.run_check('0099 audit: RIB ciphertext is redacted, never stored', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  perform update_organization_rib('5ec0a000-0000-4000-8000-000000000001','12345678901234567890');
  reset role;
  select count(*) into n from audit_log where action = 'organizations.update' and org_id = '5ec0a000-0000-4000-8000-000000000001'
     and metadata->'changed'->'rib_encrypted'->>'to' = '[redacted]';
  if n <> 1 then raise exception 'expected 1 redacted RIB audit row, got %', n; end if;
  if exists (select 1 from audit_log a, organizations o where o.id = '5ec0a000-0000-4000-8000-000000000001' and o.rib_encrypted is not null
             and a.org_id = '5ec0a000-0000-4000-8000-000000000001' and a.metadata::text like '%' || o.rib_encrypted::text || '%') then
    raise exception 'RIB ciphertext leaked into audit_log';
  end if;
end;$b$);
select pg_temp.run_check('0099 audit: advance creation recorded, idempotency key not stored; no-op updates write nothing', $b$
declare n int; before_cnt int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  perform create_advance('5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001',150,'audit test',gen_random_uuid());
  reset role;
  select count(*) into n from audit_log where action = 'advances.insert' and actor_id = '5ec0a000-0000-4000-8000-000000000011'
     and (metadata->'new'->>'amount')::numeric = 150 and not (metadata->'new' ? 'idempotency_key');
  if n <> 1 then raise exception 'advance audit rows: %', n; end if;
  select count(*) into before_cnt from audit_log where org_id = '5ec0a000-0000-4000-8000-000000000001';
  update organizations set name = name where id = '5ec0a000-0000-4000-8000-000000000001';
  update advances set updated_at = now() where org_id = '5ec0a000-0000-4000-8000-000000000001';
  if (select count(*) from audit_log where org_id = '5ec0a000-0000-4000-8000-000000000001') <> before_cnt then raise exception 'no-op update was audited'; end if;
end;$b$);
select pg_temp.run_check('0099 audit: a failing audit insert never blocks the business write', $b$
begin
  alter table audit_log add constraint tmp_sec_break check (false) not valid;
  update organizations set name = 'Still works' where id = '5ec0a000-0000-4000-8000-000000000001';
  if (select name from organizations where id = '5ec0a000-0000-4000-8000-000000000001') <> 'Still works' then raise exception 'business write blocked'; end if;
end;$b$);
select pg_temp.run_check('0099 audit: audit_log is invisible to org owners', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';  select count(*) into n from audit_log;
  if n <> 0 then raise exception 'owner can read % audit rows', n; end if;
end;$b$);

-- 0102 — views must enforce the caller's RLS

select pg_temp.run_check('0102 outsider sees no rows through active_vehicles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from active_vehicles) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0102 manager sees their own org''s vehicles through active_vehicles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from active_vehicles where org_id = '5ec0a000-0000-4000-8000-000000000001') q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0102 manager sees NO other org''s vehicles through active_vehicles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from active_vehicles where org_id = '5ec0b000-0000-4000-8000-000000000001') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_case('0102 anon cannot select active_vehicles', 'deny', 'anon', null, $q$select count(*) from active_vehicles$q$);

-- 0103 — viewer is money-blind (owner/manager keep access, workers keep their own rows)

select pg_temp.run_check('0103 viewer sees no advances', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from advances) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 owner sees advances', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from advances) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 manager sees advances', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from advances) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 outsider sees no advances', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from advances) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 viewer sees no salary_cycles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from salary_cycles) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 owner sees salary_cycles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from salary_cycles) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 manager sees salary_cycles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from salary_cycles) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 outsider sees no salary_cycles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from salary_cycles) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 viewer sees no project_expenses', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from project_expenses) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 owner sees project_expenses', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from project_expenses) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 manager sees project_expenses', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from project_expenses) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 outsider sees no project_expenses', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from project_expenses) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 worker sees own advances', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from advances where worker_id = '5ec0d000-0000-4000-8000-000000000001') q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 worker does NOT see a colleague''s advances', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from advances where worker_id = '5ec0d000-0000-4000-8000-000000000002') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 worker sees own salary cycles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from salary_cycles where worker_id = '5ec0d000-0000-4000-8000-000000000001') q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 worker does NOT see a colleague''s salary cycles', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from salary_cycles where worker_id = '5ec0d000-0000-4000-8000-000000000002') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 viewer cannot see expense amounts through the activity feed', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from org_activity_feed where org_id = '5ec0a000-0000-4000-8000-000000000001' and event_type = 'expense_recorded') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 viewer still sees operational activity (site logs, dispatch)', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from org_activity_feed where org_id = '5ec0a000-0000-4000-8000-000000000001' and event_type <> 'expense_recorded') q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 manager sees expense events in the activity feed', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from org_activity_feed where org_id = '5ec0a000-0000-4000-8000-000000000001' and event_type = 'expense_recorded') q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0103 outsider sees no activity feed', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from org_activity_feed) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0103 digest: viewer gets NULL money fields, owner gets values, non-member gets no row', $b$
declare r record; n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select * into r from get_digest_summary('5ec0a000-0000-4000-8000-000000000001');
  if r.pending_advances_count is not null or r.week_advances_total is not null then raise exception 'viewer sees advance figures in the digest'; end if;
  if r.pending_materials_count is null then raise exception 'viewer lost the operational digest fields'; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select * into r from get_digest_summary('5ec0a000-0000-4000-8000-000000000001');
  if r.week_advances_total is null or r.week_advances_total < 100 then raise exception 'owner lost the advance total: %', r.week_advances_total; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from get_digest_summary('5ec0a000-0000-4000-8000-000000000001');
  if n <> 0 then raise exception 'non-member got a digest row'; end if;
end;$b$);
select pg_temp.run_check('0103 digest_summary_for (service role, used by the Edge Function): per-recipient role rules', $b$
declare r record; n int;
begin
  perform set_config('request.jwt.claims','{"role":"service_role"}', true); execute 'set local role service_role';
  select * into r from digest_summary_for('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000010');
  if r.week_advances_total is null then raise exception 'owner digest missing advance total (this is the bug that stopped all digest pushes)'; end if;
  select * into r from digest_summary_for('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012');
  if r.pending_advances_count is not null or r.week_advances_total is not null then raise exception 'viewer digest leaks advance figures'; end if;
  select count(*) into n from digest_summary_for('5ec0a000-0000-4000-8000-000000000001','5ec0c000-0000-4000-8000-000000000010');
  if n <> 0 then raise exception 'non-member recipient got a digest'; end if;
end;$b$);
select pg_temp.run_case('0103 authenticated users cannot call digest_summary_for directly (would allow probing any user''s role)', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000010'::uuid, $q$select * from digest_summary_for('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012')$q$);
select pg_temp.run_case('0103 anon cannot call digest_summary_for', 'perm', 'anon', null, $q$select * from digest_summary_for('5ec0a000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000012')$q$);

-- 0104 — admin SQL explorer role: read-only, no credentials, no RPCs

do $$ begin
  -- SET ROLE needs membership; the migration role has ADMIN OPTION on roles it created.
  begin execute format('grant admin_explorer_ro to %I', current_user); exception when others then null; end;
end $$;

select pg_temp.run_case('0104 explorer cannot read the Vault', 'perm', 'admin_explorer_ro', null, $q$select * from vault.decrypted_secrets$q$);
select pg_temp.run_case('0104 explorer cannot read Supabase Auth users (password hashes)', 'perm', 'admin_explorer_ro', null, $q$select id, encrypted_password from auth.users$q$);
select pg_temp.run_case('0104 explorer cannot read platform_admins (TOTP secrets)', 'perm', 'admin_explorer_ro', null, $q$select * from platform_admins$q$);
select pg_temp.run_case('0104 explorer cannot read admin_sessions', 'perm', 'admin_explorer_ro', null, $q$select * from admin_sessions$q$);
select pg_temp.run_case('0104 explorer cannot read mfa_recovery_codes', 'perm', 'admin_explorer_ro', null, $q$select * from mfa_recovery_codes$q$);
select pg_temp.run_case('0104 explorer cannot read organizations.rib_encrypted', 'perm', 'admin_explorer_ro', null, $q$select rib_encrypted from organizations$q$);
select pg_temp.run_case('0104 explorer cannot read profiles.expo_push_token', 'perm', 'admin_explorer_ro', null, $q$select expo_push_token from profiles$q$);
select pg_temp.run_case('0104 explorer cannot call approve_advance (no RPC access)', 'perm', 'admin_explorer_ro', null, $q$select approve_advance(gen_random_uuid(), gen_random_uuid(), 'x')$q$);
select pg_temp.run_case('0104 explorer cannot call update_organization_member_role', 'perm', 'admin_explorer_ro', null, $q$select update_organization_member_role(gen_random_uuid(), gen_random_uuid(), 'owner')$q$);
select pg_temp.run_case('0104 explorer cannot read server files', 'perm', 'admin_explorer_ro', null, $q$select pg_read_file('/etc/passwd')$q$);
select pg_temp.run_case('0104 explorer cannot INSERT', 'perm', 'admin_explorer_ro', null, $q$insert into sync_tombstones(table_name, record_id, org_id) values ('materials', gen_random_uuid(), gen_random_uuid())$q$);
select pg_temp.run_case('0104 explorer cannot UPDATE', 'perm', 'admin_explorer_ro', null, $q$update workers set full_name = 'x'$q$);
select pg_temp.run_case('0104 explorer cannot DELETE', 'perm', 'admin_explorer_ro', null, $q$delete from workers$q$);
select pg_temp.run_case('0104 explorer cannot create tables', 'perm', 'admin_explorer_ro', null, $q$create table sec_pwn(a int)$q$);
select pg_temp.run_case('0104 explorer can read non-secret organization columns', 'ok', 'admin_explorer_ro', null, $q$select id, name, plan, subscription_status, rib_last4 from organizations$q$);
select pg_temp.run_case('0104 explorer can read workers, attendance and advances', 'ok', 'admin_explorer_ro', null, $q$select (select count(*) from workers), (select count(*) from attendance_records), (select count(*) from advances)$q$);
select pg_temp.run_case('0104 explorer can read audit_log', 'ok', 'admin_explorer_ro', null, $q$select count(*) from audit_log$q$);
select pg_temp.run_check('0104 explorer holds NO write privilege on any table and is not a privileged role', $b$
declare bad text; r record;
begin
  select string_agg(c.relname || ':' || p.priv, ', ') into bad
  from pg_class c cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m')
    and has_table_privilege('admin_explorer_ro', c.oid, p.priv);
  if bad is not null then raise exception 'explorer has write privileges: %', bad; end if;
  select * into r from pg_roles where rolname = 'admin_explorer_ro';
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolcanlogin then raise exception 'explorer group role is over-privileged'; end if;
  if has_schema_privilege('admin_explorer_ro', 'public', 'CREATE') then raise exception 'explorer can create objects in public'; end if;
  if has_schema_privilege('admin_explorer_ro', 'vault', 'USAGE') or has_schema_privilege('admin_explorer_ro', 'auth', 'USAGE') then raise exception 'explorer can use the vault/auth schema'; end if;
end;$b$);
select pg_temp.run_check('0104 fail-closed: a table created later is NOT readable until a migration grants it', $b$
begin
  create table public.sec_future_table (id int, secret_note text);
  if has_table_privilege('admin_explorer_ro', 'public.sec_future_table', 'SELECT') then
    raise exception 'new tables are readable by default (would leak future secrets)';
  end if;
end;$b$);

-- 0105 — account deletion must work for users with history

select pg_temp.run_check('0105 a user who created projects/expenses/logs/advances/materials/orgs can be deleted; records stay, attribution is nulled', $b$
declare n int;
begin
  insert into auth.users(id,email) values ('5ec0c000-0000-4000-8000-000000000077','leaver@example.invalid');
  insert into organizations(id,name,created_by) values ('5ec0c000-0000-4000-8000-000000000078','Leaver Org','5ec0c000-0000-4000-8000-000000000077');
  insert into organization_members(org_id,user_id,role) values ('5ec0a000-0000-4000-8000-000000000001','5ec0c000-0000-4000-8000-000000000077','manager');
  insert into projects(id,lead_org_id,name,created_by) values ('5ec0c000-0000-4000-8000-000000000079','5ec0a000-0000-4000-8000-000000000001','P by leaver','5ec0c000-0000-4000-8000-000000000077');
  insert into project_expenses(id,org_id,project_id,category,amount,created_by) values ('5ec0c000-0000-4000-8000-000000000080','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','autre',12,'5ec0c000-0000-4000-8000-000000000077');
  insert into site_logs(id,org_id,project_id,note_text,logged_by) values ('5ec0c000-0000-4000-8000-000000000081','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','by leaver','5ec0c000-0000-4000-8000-000000000077');
  insert into advances(id,org_id,worker_id,amount,status,requested_by) values ('5ec0c000-0000-4000-8000-000000000082','5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',5,'pending','5ec0c000-0000-4000-8000-000000000077');
  insert into materials(id,org_id,project_id,item,quantity,status,created_by) values ('5ec0c000-0000-4000-8000-000000000083','5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','x',1,'pending','5ec0c000-0000-4000-8000-000000000077');
  insert into workers(id,org_id,full_name,daily_rate,user_id) values ('5ec0c000-0000-4000-8000-000000000084','5ec0a000-0000-4000-8000-000000000001','Leaver Worker',90,'5ec0c000-0000-4000-8000-000000000077');
  delete from auth.users where id = '5ec0c000-0000-4000-8000-000000000077';   -- what auth.admin.deleteUser() does; used to raise a FK violation
  select count(*) into n from auth.users where id = '5ec0c000-0000-4000-8000-000000000077';
  if n <> 0 then raise exception 'user still exists'; end if;
  if (select created_by from projects where id = '5ec0c000-0000-4000-8000-000000000079') is not null then raise exception 'project attribution not cleared'; end if;
  if (select count(*) from projects where id = '5ec0c000-0000-4000-8000-000000000079') <> 1 then raise exception 'project was deleted with the user'; end if;
  if (select count(*) from project_expenses where id = '5ec0c000-0000-4000-8000-000000000080' and created_by is null) <> 1 then raise exception 'expense lost or still attributed'; end if;
  if (select count(*) from site_logs where id = '5ec0c000-0000-4000-8000-000000000081' and logged_by is null) <> 1 then raise exception 'site log lost or still attributed'; end if;
  if (select count(*) from advances where id = '5ec0c000-0000-4000-8000-000000000082' and requested_by is null) <> 1 then raise exception 'advance lost or still attributed'; end if;
  if (select count(*) from materials where id = '5ec0c000-0000-4000-8000-000000000083' and created_by is null) <> 1 then raise exception 'material lost or still attributed'; end if;
  if (select count(*) from workers where id = '5ec0c000-0000-4000-8000-000000000084' and user_id is null) <> 1 then raise exception 'worker record lost or still linked'; end if;
  if (select count(*) from organizations where id = '5ec0c000-0000-4000-8000-000000000078' and created_by is null) <> 1 then raise exception 'organisation lost or still attributed'; end if;
end;$b$);

-- Edge Function internal-caller guard (unit-level, not Deno-runtime): confirm the source now
-- imports requireInternalCaller before doing any work, for every cron-only function.


-- 0106 — suspension scope: platform ban always blocks login; org suspension
-- blocks a user only if it leaves them with NO usable (member or worker) org

select pg_temp.run_check('0106 multi-org user with 1 active + 1 suspended org is NOT blocked from login (was a bug: blocked ALL orgs)', $b$
declare u uuid := '5ec09000-0000-4000-8000-000000000090'; oS uuid := '5ec09000-0000-4000-8000-000000000091'; blocked boolean;
begin
  insert into auth.users(id,email) values (u,'multiorg-5ec09000@example.invalid');
  insert into organizations(id,name,created_by,suspended_at) values (oS,'ToSuspend','5ec0a000-0000-4000-8000-000000000010',now());
  insert into organization_members(org_id,user_id,role) values ('5ec0a000-0000-4000-8000-000000000001',u,'viewer'), (oS,u,'manager');
  begin
    perform check_suspension_before_token_issuance(jsonb_build_object('user_id',u));
    blocked := false;
  exception when others then
    blocked := sqlerrm like 'DALA_ACCOUNT_SUSPENDED%';
    if not blocked then raise; end if;
  end;
  if blocked then raise exception 'user with a still-active org was blocked from logging in'; end if;
end;$b$);
select pg_temp.run_check('0106 a worker-only account (no organization_members row) in a suspended org IS blocked (was a gap: not blocked at all)', $b$
declare u uuid := '5ec09000-0000-4000-8000-000000000092'; oS uuid := '5ec09000-0000-4000-8000-000000000093'; blocked boolean;
begin
  insert into auth.users(id,email) values (u,'suspworker-5ec09000@example.invalid');
  insert into organizations(id,name,created_by,suspended_at) values (oS,'ToSuspend2','5ec0a000-0000-4000-8000-000000000010',now());
  insert into workers(id,org_id,full_name,daily_rate,user_id) values ('5ec09000-0000-4000-8000-000000000094',oS,'W',50,u);
  begin
    perform check_suspension_before_token_issuance(jsonb_build_object('user_id',u));
    blocked := false;
  exception when others then
    blocked := sqlerrm like 'DALA_ACCOUNT_SUSPENDED%';
    if not blocked then raise; end if;
  end;
  if not blocked then raise exception 'worker in a fully-suspended org was NOT blocked from logging in'; end if;
end;$b$);
select pg_temp.run_check('0106 a platform-banned profile is blocked even with an otherwise-active org', $b$
declare u uuid := '5ec09000-0000-4000-8000-000000000095'; blocked boolean;
begin
  insert into auth.users(id,email) values (u,'banned-5ec09000@example.invalid');
  update profiles set suspended_at = now() where id = u;
  insert into organization_members(org_id,user_id,role) values ('5ec0a000-0000-4000-8000-000000000001',u,'viewer');
  begin
    perform check_suspension_before_token_issuance(jsonb_build_object('user_id',u));
    blocked := false;
  exception when others then
    blocked := sqlerrm like 'DALA_ACCOUNT_SUSPENDED%';
    if not blocked then raise; end if;
  end;
  if not blocked then raise exception 'platform-banned user was NOT blocked'; end if;
end;$b$);

-- 0107 — vehicle maintenance spend is owner/manager only (viewer money-blind, cont.)

select pg_temp.run_check('0107 viewer sees no vehicle_maintenance_log', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from vehicle_maintenance_log) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0107 owner sees vehicle_maintenance_log', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from vehicle_maintenance_log) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0107 manager sees vehicle_maintenance_log', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from vehicle_maintenance_log) q;
  if n = 0 then raise exception 'cannot see rows they should see'; end if;
end;$b$);
select pg_temp.run_check('0107 outsider sees no vehicle_maintenance_log', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from vehicle_maintenance_log) q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);

-- 0108 — worker_directory: daily_rate masked per row (viewer money-blind, worker self-view kept)

select pg_temp.run_check('0108 owner and manager see the real rate through worker_directory', $b$
declare r numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select daily_rate into r from worker_directory where id = '5ec0d000-0000-4000-8000-000000000001';
  if r is null then raise exception 'owner got a NULL rate through worker_directory'; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select daily_rate into r from worker_directory where id = '5ec0d000-0000-4000-8000-000000000001';
  if r is null then raise exception 'manager got a NULL rate through worker_directory'; end if;
end;$b$);
select pg_temp.run_check('0108 viewer gets NULL for a colleague''s rate, but still sees the roster row (name etc.)', $b$
declare r numeric; n text;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select daily_rate, full_name into r, n from worker_directory where id = '5ec0d000-0000-4000-8000-000000000001';
  if r is not null then raise exception 'viewer saw a real rate through worker_directory: %', r; end if;
  if n is null then raise exception 'viewer lost the operational columns (full_name) too'; end if;
end;$b$);
select pg_temp.run_check('0108 a worker sees their OWN rate through worker_directory (not blinded by their own money-blind role)', $b$
declare r numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000013","role":"authenticated"}', true); execute 'set local role authenticated';
  select daily_rate into r from worker_directory where id = '5ec0d000-0000-4000-8000-000000000001' and user_id = '5ec0a000-0000-4000-8000-000000000013';
  if r is null then raise exception 'worker could not see their own rate'; end if;
end;$b$);
select pg_temp.run_check('0108 outsider sees no rows through worker_directory', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from worker_directory where org_id = '5ec0a000-0000-4000-8000-000000000001') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_case('0108 anon cannot select worker_directory at all', 'deny', 'anon', null, $q$select count(*) from worker_directory$q$);
select pg_temp.run_check('0108 active_worker_directory: outsider sees no rows', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from active_worker_directory where org_id = '5ec0a000-0000-4000-8000-000000000001') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_check('0108 active_worker_directory: viewer sees roster rows but not the rate; owner sees the rate', $b$
declare r numeric; n_rows int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n_rows from active_worker_directory where org_id = '5ec0a000-0000-4000-8000-000000000001';
  if n_rows = 0 then raise exception 'viewer lost the active roster entirely'; end if;
  select daily_rate into r from active_worker_directory where id = '5ec0d000-0000-4000-8000-000000000001';
  if r is not null then raise exception 'viewer saw a real rate through active_worker_directory'; end if;
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select daily_rate into r from active_worker_directory where id = '5ec0d000-0000-4000-8000-000000000001';
  if r is null then raise exception 'owner lost the rate through active_worker_directory'; end if;
end;$b$);
select pg_temp.run_check('0108 the underlying workers table and every FK to it are untouched (embedding still works)', $b$
declare n int;
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='workers') then
    raise exception 'workers table is gone';
  end if;
  select count(*) into n from pg_constraint
    where contype='f' and confrelid='public.workers'::regclass;
  if n = 0 then raise exception 'no FKs point at workers anymore (embedding would be broken)'; end if;
end;$b$);

-- 0109 — material_requests_directory: cost masked per row (viewer money-blind, cont.)

select pg_temp.run_check('0109 owner and manager see the real cost through material_requests_directory', $b$
declare c numeric;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select cost into c from material_requests_directory where id = '5ec09000-0000-4000-8000-000000000003';
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000011","role":"authenticated"}', true); execute 'set local role authenticated';
  select cost into c from material_requests_directory where id = '5ec09000-0000-4000-8000-000000000003';
end;$b$);
select pg_temp.run_check('0109 viewer gets NULL cost but keeps the operational row (item/status)', $b$
declare c numeric; it text;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000012","role":"authenticated"}', true); execute 'set local role authenticated';
  select cost, item into c, it from material_requests_directory where id = '5ec09000-0000-4000-8000-000000000003';
  if c is not null then raise exception 'viewer saw a real cost: %', c; end if;
  if it is null then raise exception 'viewer lost the operational columns too'; end if;
end;$b$);
select pg_temp.run_check('0109 outsider sees no rows through material_requests_directory', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0c000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  select count(*) into n from (select 1 from material_requests_directory where org_id = '5ec0a000-0000-4000-8000-000000000001') q;
  if n <> 0 then raise exception 'LEAK: sees % row(s)', n; end if;
end;$b$);
select pg_temp.run_case('0109 anon cannot select material_requests_directory', 'deny', 'anon', null, $q$select count(*) from material_requests_directory$q$);

-- 0112 — dispatch/project rows must be scoped to the org the PROJECT belongs to
--
-- The attack this pins (MT-2). `is_project_participant(project_id)` is
-- caller-scoped: it answers "is the CURRENT USER associated with this project
-- through SOME org", not "is the org on the row associated with it". The
-- write policies on dispatch_assignments/project_workers ask the first
-- question about the org column and the second about the project column, so
-- one account belonging to two orgs satisfies both with DIFFERENT orgs.
-- Fixtures for the attack: the `dual-a` user created in the fixture block above
-- is a MANAGER of Org A and a plain member of Org B, and SecTest Project B2 is
-- led by Org B with no membership row for Org A. So for that one account
-- "am I a participant of this project?" and "is my row's org a participant of
-- this project?" have OPPOSITE answers — which is the whole bug.
--
-- legitimate use that must keep working -----------------------------------------
select pg_temp.run_case('0112 lead org A can still dispatch on its own project', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',current_date+1)$q$);
select pg_temp.run_case('0112 trade org B can still dispatch its own worker on shared project A', 'ok', 'authenticated', '5ec0b000-0000-4000-8000-000000000010'::uuid, $q$insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date) values ('5ec0b000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000003',current_date)$q$);
select pg_temp.run_case('0112 trade org B can still add its own worker to shared project A''s roster', 'ok', 'authenticated', '5ec0b000-0000-4000-8000-000000000010'::uuid, $q$insert into project_workers(project_id,worker_id) values ('5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000003')$q$);
select pg_temp.run_case('0112 dispatch with no project_id (maintenance/unassigned) is still allowed', 'ok', 'authenticated', '5ec0a000-0000-4000-8000-000000000011'::uuid, $q$insert into dispatch_assignments(org_id,worker_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',current_date+2)$q$);
select pg_temp.run_case('0112 anon still cannot insert a dispatch assignment', 'deny', 'anon', null, $q$insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000002',current_date+3)$q$);

-- the three attacks (SecTest Project B2 = led by Org B, Org A not a participant)
select pg_temp.run_case('0112 dual-membership manager CANNOT dispatch org A''s worker onto org B''s project', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000014'::uuid, $q$insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date) values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000003','5ec0d000-0000-4000-8000-000000000001',current_date)$q$);
select pg_temp.run_case('0112 dual-membership manager CANNOT staff org A''s worker on org B''s project roster', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000014'::uuid, $q$insert into project_workers(project_id,worker_id) values ('5ec0e000-0000-4000-8000-000000000003','5ec0d000-0000-4000-8000-000000000001')$q$);
select pg_temp.run_case('0112 dual-membership manager CANNOT re-point an existing assignment at org B''s project', 'perm', 'authenticated', '5ec0a000-0000-4000-8000-000000000014'::uuid, $q$update dispatch_assignments set project_id = '5ec0e000-0000-4000-8000-000000000003' where id = '5ec09000-0000-4000-8000-000000000001'$q$);


-- participation changes take effect on the next write --------------------------
-- (the delete below is undone automatically: run_check's body is rolled back)
select pg_temp.run_check('0112 losing the trade membership blocks the next roster write', $b$
begin
  delete from project_memberships
   where project_id = '5ec0e000-0000-4000-8000-000000000001'
     and org_id = '5ec0b000-0000-4000-8000-000000000001';
  perform set_config('request.jwt.claims', '{"sub":"5ec0b000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  begin
    insert into project_workers(project_id,worker_id) values ('5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000003');
    raise exception 'an org removed from the project could still staff its worker';
  exception when insufficient_privilege then null;
  end;
end;$b$);

-- the auto-seed trigger ---------------------------------------------------------
select pg_temp.run_check('0112 an allowed dispatch still auto-seeds the roster; a blocked one seeds nothing', $b$
declare n int;
begin
  perform set_config('request.jwt.claims', '{"sub":"5ec0b000-0000-4000-8000-000000000010","role":"authenticated"}', true); execute 'set local role authenticated';
  insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date)
    values ('5ec0b000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000003',current_date+1);
  reset role;
  select count(*) into n from project_workers
   where project_id = '5ec0e000-0000-4000-8000-000000000001'
     and worker_id  = '5ec0d000-0000-4000-8000-000000000003'
     and org_id     = '5ec0b000-0000-4000-8000-000000000001';
  if n <> 1 then raise exception 'legitimate auto-seed missing (% row(s))', n; end if;

  perform set_config('request.jwt.claims', '{"sub":"5ec0a000-0000-4000-8000-000000000014","role":"authenticated"}', true); execute 'set local role authenticated';
  begin
    insert into dispatch_assignments(org_id,project_id,worker_id,assignment_date)
      values ('5ec0a000-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000003','5ec0d000-0000-4000-8000-000000000001',current_date+1);
    raise exception 'the cross-org dispatch was NOT blocked';
  exception when insufficient_privilege then null;   -- 42501, the RLS refusal
  end;
  reset role;
  select count(*) into n from project_workers where project_id = '5ec0e000-0000-4000-8000-000000000003';
  if n <> 0 then raise exception 'LEAK: % roster row(s) on another org''s project', n; end if;
end;$b$);


-- composite FK: a roster row cannot name a worker from another org -------------
-- (project_workers.org_id is derived from the worker on INSERT by 0034's trigger,
-- so the FK is what stops a later UPDATE from re-pointing worker_id at another
-- org's worker while keeping this row's org_id.)
select pg_temp.run_check('0112 project_workers cannot be re-pointed at another org''s worker (composite FK)', $b$
begin
  insert into project_workers (id, project_id, worker_id, org_id)
    values ('5ec09100-0000-4000-8000-000000000001','5ec0e000-0000-4000-8000-000000000001','5ec0d000-0000-4000-8000-000000000001','5ec0a000-0000-4000-8000-000000000001');
  begin
    update project_workers set worker_id = '5ec0d000-0000-4000-8000-000000000003'
     where id = '5ec09100-0000-4000-8000-000000000001';
    raise exception 'roster row was re-pointed at another org''s worker';
  exception when foreign_key_violation then null;
  end;
end;$b$);


-- ---------------------------------------------------------------- verdict
create temp view verdicts as
select label, expect, result,
  case when (expect = 'perm'  and result like 'ERR 42501 %')
         or (expect = 'deny'  and result like 'ERR%')
         or (expect = 'ok'    and result = 'EXECUTED')
         or (expect = 'reach' and result not like 'ERR 42501%')
         or (expect = 'check' and result = 'EXECUTED')
       then 'pass' else 'FAIL' end as verdict
from results;

do $$
declare
  r record; total int; failed int;
begin
  select count(*), count(*) filter (where verdict = 'FAIL') into total, failed from verdicts;
  for r in select * from verdicts where verdict = 'FAIL' order by label loop
    raise notice 'FAIL  % [expected %] -> %', r.label, r.expect, r.result;
  end loop;
  raise notice 'security_regression: % cases, % failed', total, failed;
  if failed > 0 then
    raise exception 'security_regression: % of % cases failed', failed, total;
  end if;
end $$;

rollback;
