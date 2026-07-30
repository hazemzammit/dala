-- =============================================================================
-- seed.sql — local development only. Runs automatically on `supabase db reset`.
-- Never run this against staging or production.
--
-- Rebuilds a full, realistic dataset every reset: 2 orgs, 3 login-capable
-- accounts (owner/manager/worker) plus a second org for collaboration
-- testing, projects in every status, dispatch/attendance/advances/materials/
-- site logs/safety/insurance — so you stop hand-recreating test accounts
-- after every migration.
--
-- All test accounts use the same password: Test1234!
--   ahmed@dala.tn    — owner, Plomberie Ben Ali (org 1)
--   sami@dala.tn     — manager, Plomberie Ben Ali (org 1)
--   karim@dala.tn    — worker self-access account, linked to a workers row
--   yassine@dala.tn  — owner, Élec Zayani (org 2) — trade partner on a
--                       shared project, for multi-org / collaboration testing
--
-- All ids below are fixed, human-readable literals (not gen_random_uuid())
-- so foreign keys stay legible and so re-running this file is idempotent —
-- `on conflict do nothing` throughout means it's also safe to run manually
-- against a DB that already has this seed applied.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — auth.users + auth.identities
--
-- Supabase Auth's tables ARE just Postgres tables in local dev — you can
-- insert into them directly. `crypt(..., gen_salt('bf'))` needs pgcrypto,
-- already enabled by migration 0001. The `on_auth_user_created` trigger
-- (migration 0002) fires on insert and creates the matching `profiles` row
-- automatically, reading full_name/phone from raw_user_meta_data — so
-- profiles are NOT inserted manually below.
--
-- auth.identities is required alongside auth.users for email/password
-- sign-in to actually succeed against local GoTrue — a users-only insert
-- looks fine in Studio but fails to log in without the matching identity row.
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000001',
   'authenticated', 'authenticated', 'ahmed@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Ahmed Ben Ali","phone":"+21620000001"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000002',
   'authenticated', 'authenticated', 'sami@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Sami Trabelsi","phone":"+21620000002"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000003',
   'authenticated', 'authenticated', 'karim@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Karim Gharbi","phone":"+21620000003"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000004',
   'authenticated', 'authenticated', 'yassine@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Yassine Zayani","phone":"+21620000004"}',
   now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) values
  (gen_random_uuid(), '22222222-2222-2222-2222-000000000001', '22222222-2222-2222-2222-000000000001',
   '{"sub":"22222222-2222-2222-2222-000000000001","email":"ahmed@dala.tn"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-000000000002', '22222222-2222-2222-2222-000000000002',
   '{"sub":"22222222-2222-2222-2222-000000000002","email":"sami@dala.tn"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000003',
   '{"sub":"22222222-2222-2222-2222-000000000003","email":"karim@dala.tn"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '22222222-2222-2222-2222-000000000004', '22222222-2222-2222-2222-000000000004',
   '{"sub":"22222222-2222-2222-2222-000000000004","email":"yassine@dala.tn"}', 'email', now(), now(), now())
on conflict (provider, provider_id) do nothing;

-- ---------------------------------------------------------------------------
-- Part 2 — organizations + membership
-- ---------------------------------------------------------------------------

insert into organizations (id, name, trade_type, address, contact_phone, contact_email, matricule_fiscal, rc_number, plan, created_by)
values
  ('11111111-1111-1111-1111-000000000001', 'Plomberie Ben Ali', 'plomberie',
   'Rue Ibn Khaldoun, Ariana', '+21671000001', 'contact@benali-plomberie.tn',
   '1234567A', 'B012345678', 'free', '22222222-2222-2222-2222-000000000001'),
  ('11111111-1111-1111-1111-000000000002', 'Élec Zayani', 'électricité',
   'Avenue Habib Bourguiba, Sousse', '+21673000002', 'contact@zayani-elec.tn',
   '7654321B', 'B087654321', 'free', '22222222-2222-2222-2222-000000000004')
on conflict (id) do nothing;

insert into organization_members (org_id, user_id, role) values
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'owner'),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000002', 'manager'),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000004', 'owner')
on conflict (org_id, user_id) do nothing;

update profiles set active_org_id = '11111111-1111-1111-1111-000000000001'
  where id in ('22222222-2222-2222-2222-000000000001', '22222222-2222-2222-2222-000000000002', '22222222-2222-2222-2222-000000000003');
update profiles set active_org_id = '11111111-1111-1111-1111-000000000002'
  where id = '22222222-2222-2222-2222-000000000004';

-- ---------------------------------------------------------------------------
-- Part 3 — workers
-- Karim is both a login account (Part 1) AND a worker row, linked via
-- user_id, for testing the worker self-access screens (Pointage, salary
-- view, material-request). Mohamed and Fedi are org-1 workers with no
-- login yet — Fedi has a pending invitation (Part 8) to test the accept
-- flow. Walid belongs to org 2.
-- ---------------------------------------------------------------------------

insert into workers (id, org_id, full_name, phone, trade, daily_rate, user_id) values
  ('44444444-4444-4444-4444-000000000001', '11111111-1111-1111-1111-000000000001',
   'Karim Gharbi', '+21620000003', 'plombier', 60.00, '22222222-2222-2222-2222-000000000003'),
  ('44444444-4444-4444-4444-000000000002', '11111111-1111-1111-1111-000000000001',
   'Mohamed Sassi', '+21622111222', 'plombier', 55.00, null),
  ('44444444-4444-4444-4444-000000000003', '11111111-1111-1111-1111-000000000001',
   'Fedi Jlassi', '+21655333444', 'aide', 40.00, null),
  ('44444444-4444-4444-4444-000000000004', '11111111-1111-1111-1111-000000000002',
   'Walid Hammami', '+21698777666', 'électricien', 65.00, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Part 4 — projects (one of each status, one soft-deleted for Trash)
-- ---------------------------------------------------------------------------

insert into projects (id, lead_org_id, name, client_name, address, budget_total, status, start_date, project_type, created_by) values
  ('33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000001',
   'Villa Ariana', 'Famille Khelifi', 'Ariana Ville', 150000.00, 'active',
   current_date - interval '20 days', 'residentiel', '22222222-2222-2222-2222-000000000001'),
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000001',
   'Immeuble Sousse', 'Promoteur SCI Yosr', 'Sousse Corniche', 500000.00, 'active',
   current_date - interval '60 days', 'commercial', '22222222-2222-2222-2222-000000000001'),
  ('33333333-3333-3333-3333-000000000003', '11111111-1111-1111-1111-000000000001',
   'Rénovation Bureau Centre-Ville', 'Cabinet Trabelsi', 'Tunis Centre', 45000.00, 'completed',
   current_date - interval '200 days', 'renovation', '22222222-2222-2222-2222-000000000001'),
  ('33333333-3333-3333-3333-000000000004', '11111111-1111-1111-1111-000000000001',
   'Ancien Chantier Annulé', 'Client retiré', 'La Marsa', 30000.00, 'active',
   current_date - interval '90 days', 'residentiel', '22222222-2222-2222-2222-000000000001')
on conflict (id) do nothing;

-- Soft-delete the 4th project so the Trash screen has something to restore.
update projects set deleted_at = now() - interval '2 days'
  where id = '33333333-3333-3333-3333-000000000004';

-- Élec Zayani (org 2) is a trade partner on the Sousse project — multi-org
-- collaboration / cross-org rollup testing.
insert into project_memberships (project_id, org_id, role, budget_rollup_opt_in) values
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000001', 'lead', true),
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000002', 'trade', true)
on conflict (project_id, org_id) do nothing;

-- ---------------------------------------------------------------------------
-- Part 5 — vehicles + dispatch + attendance
-- ---------------------------------------------------------------------------

insert into vehicles (id, org_id, name, plate, capacity, status) values
  ('55555555-5555-5555-5555-000000000001', '11111111-1111-1111-1111-000000000001',
   'Camionnette 1', '123 TUN 4567', 3, 'available'),
  ('55555555-5555-5555-5555-000000000002', '11111111-1111-1111-1111-000000000001',
   'Camionnette 2', '789 TUN 1234', 2, 'in_use')
on conflict (id) do nothing;

insert into dispatch_assignments (org_id, project_id, vehicle_id, worker_id, assignment_date, departure_time, confirmation_channel, actual_departure_time) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   '55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000001',
   current_date, '07:00', 'app', '07:22'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   '55555555-5555-5555-5555-000000000002', '44444444-4444-4444-4444-000000000002',
   current_date, '07:00', 'whatsapp', '07:05'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   '55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000001',
   current_date + 1, '07:00', null, null)
on conflict do nothing;

-- A few weeks of attendance history (mostly present, a couple absences) so
-- the Tier 0 lateness pattern RPC and payroll views have something to read.
insert into attendance_records (org_id, worker_id, project_id, record_date, status, source) values
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 7, 'present', 'dispatch_checkin'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 6, 'present', 'dispatch_checkin'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 5, 'absent', 'manual_pointage'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 3, 'present', 'dispatch_checkin'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000002', current_date - 4, 'present', 'dispatch_checkin'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000002', current_date - 3, 'half_day', 'manual_pointage')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 6 — money: advances, project_expenses, salary_cycles
-- ---------------------------------------------------------------------------

insert into advances (org_id, worker_id, amount, reason, status, requested_by, approved_by) values
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', 150.00,
   'Avance pour transport', 'approved', '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000001'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', 80.00,
   'Avance urgente', 'pending', null, null)
on conflict do nothing;

insert into project_expenses (org_id, project_id, category, amount, description, expense_date, created_by) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'materiaux', 4200.00, 'Tuyauterie PVC et raccords', current_date - 10, '22222222-2222-2222-2222-000000000001'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'carburant', 300.00, 'Essence camionnette', current_date - 5, '22222222-2222-2222-2222-000000000002'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002', 'sous_traitance', 15000.00, 'Sous-traitant maçonnerie', current_date - 15, '22222222-2222-2222-2222-000000000001')
on conflict do nothing;

insert into salary_cycles (org_id, worker_id, cycle_start, cycle_end, status) values
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', current_date - 14, current_date - 8, 'paid'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', current_date - 7, current_date - 1, 'pending')
on conflict (org_id, worker_id, cycle_start) do nothing;

-- ---------------------------------------------------------------------------
-- Part 7 — materials, site logs, safety, insurance
-- Photo/document URLs are placeholder paths — no Storage object actually
-- exists behind them, so an image render will 404. Fine for list/RLS
-- testing; upload a real photo through the app once to test the render path.
-- ---------------------------------------------------------------------------

insert into materials (org_id, project_id, item, quantity, urgency, note, status, created_by, approved_by) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'Sable', 5, 'normal', 'Pour fondation', 'approved', '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000001'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'Ciment', 20, 'urgent', 'Rupture de stock', 'pending', '22222222-2222-2222-2222-000000000003', null),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002', 'Câbles électriques', 100, 'normal', null, 'rejected', '22222222-2222-2222-2222-000000000002', '22222222-2222-2222-2222-000000000001')
on conflict do nothing;

insert into site_logs (org_id, project_id, photo_url, caption, logged_by) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'org-files/seed/villa-fondation.jpg', 'Coulage des fondations terminé', '22222222-2222-2222-2222-000000000001'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002', 'org-files/seed/sousse-structure.jpg', 'Structure niveau 2 en cours', '22222222-2222-2222-2222-000000000002')
on conflict do nothing;

insert into safety_incidents (org_id, project_id, description, severity, reported_by) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'Glissade sans blessure sur sol mouillé', 'minor', '22222222-2222-2222-2222-000000000002')
on conflict do nothing;

insert into org_insurances (org_id, provider_name, policy_number, expires_at) values
  ('11111111-1111-1111-1111-000000000001', 'STAR Assurances', 'POL-2026-00981', current_date + interval '180 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 8 — pending worker invitation (accept-flow testing)
-- ---------------------------------------------------------------------------

insert into worker_invitations (worker_id, token, channel, status) values
  ('44444444-4444-4444-4444-000000000003', 'seed-pending-invite-fedi-jlassi', 'whatsapp', 'pending')
on conflict (token) do nothing;
