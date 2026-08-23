-- =============================================================================
-- seed.sql — local development only. Runs automatically on `supabase db reset`.
-- Never run this against staging or production.
--
-- Rebuilds a full, realistic dataset covering every table and every column
-- in the schema (51 tables as of migration 0077), across several distinct
-- account/org scenarios so you can exercise every screen and edge case
-- without hand-building test data after every migration:
--
--   - ORG 1 "Plomberie Ben Ali"  — active/paid, richest dataset (the
--     "everything works, lots of history" org): full profile fields, owner
--     + manager + viewer + 2 login-capable workers + 2 no-login workers
--     (one soft-deleted), 5 projects (active/active-collab/completed/
--     archived/soft-deleted), 3 vehicles (one soft-deleted, one with a
--     maintenance log + expiring/expired documents), dispatch conflicts,
--     an attendance correction, advances in every status, expenses incl.
--     one soft-deleted, materials incl. one with a cost pushed to expenses,
--     site logs incl. voice note + soft-deleted + geotagged, safety
--     incidents in all 3 severities with worker links, 2 insurance
--     policies (one expiring soon, one expired), a locked-out and a
--     working client portal, 2 invoices, project/org-member invitations
--     in every status, a pending phone-change request, MFA recovery codes.
--   - ORG 2 "Élec Zayani"        — trialing, the cross-org trade partner on
--     org 1's Sousse project (multi-org collaboration testing).
--   - ORG 3 "Menuiserie Karray"  — past_due, at the free-tier caps (3
--     projects / 3 workers) to test downgrade enforcement (migration 0044).
--   - ORG 4 "Climatisation Cap Bon" — brand new signup, zero data beyond
--     the org + owner, to test first-run onboarding (migration 0077).
--   - Platform Admin: 3 admin accounts (super_admin/admin/support), an
--     active + an expired + an impersonating session, an approval request,
--     announcements (published + scheduled, mixed channels), service
--     health checks, feature flags + a per-org override, audit log
--     entries, admin notes, alert state, email delivery events, TOTP
--     rotation state, platform metrics history, edge function invocation
--     + rate-limit rows, and app_versions.
--
-- All test accounts use the same password: Test1234!
--   ahmed@dala.tn      — owner, Plomberie Ben Ali (org 1)
--   sami@dala.tn       — manager, Plomberie Ben Ali (org 1) — has MFA recovery codes seeded
--   nadia@dala.tn      — viewer, Plomberie Ben Ali (org 1) — accepted a member invite
--   karim@dala.tn      — worker self-access account, org 1
--   yassine@dala.tn    — owner, Élec Zayani (org 2)
--   farid@dala.tn      — owner, Menuiserie Karray (org 3, past_due)
--   sana@dala.tn       — owner, Climatisation Cap Bon (org 4, brand new)
--   superadmin@dala.tn — Platform Admin, role=super_admin
--   admin@dala.tn      — Platform Admin, role=admin
--   support@dala.tn    — Platform Admin, role=support
--
-- All ids below are fixed, human-readable literals (not gen_random_uuid())
-- for every row another row's FK might need to reference, so foreign keys
-- stay legible and re-running this file is idempotent — `on conflict do
-- nothing` throughout means it's also safe to run manually against a DB
-- that already has this seed applied. Leaf/transactional rows with no
-- downstream FK dependents use gen_random_uuid() via the column default,
-- matching the convention already established in the pre-existing seed.
--
-- Photo/document/voice URLs throughout are placeholder Storage paths — no
-- Storage object actually exists behind them, so an image/audio render
-- will 404. Fine for list/RLS/UI-shape testing; upload a real file through
-- the app once to test the actual render path.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part 1 — auth.users + auth.identities
--
-- Supabase Auth's tables ARE just Postgres tables in local dev — you can
-- insert into them directly. `crypt(..., gen_salt('bf'))` needs pgcrypto,
-- already enabled by migration 0001. The `on_auth_user_created` trigger
-- (migration 0002) fires on insert and creates the matching `profiles` row
-- automatically, reading full_name/phone from raw_user_meta_data — so
-- profiles are NOT inserted manually; they're UPDATEd afterward for the
-- extra fields the trigger doesn't set.
--
-- auth.identities is required alongside auth.users for email/password
-- sign-in to actually succeed against local GoTrue — a users-only insert
-- looks fine in Studio but fails to log in without the matching identity row.
--
-- Platform admin accounts (superadmin@/admin@/support@) are separate
-- auth.users rows too — platform_admins.id references auth.users(id), same
-- as profiles.id does, but a platform admin deliberately has no matching
-- organization_members row anywhere (Doc 01 §1.2 — not a tenant member).
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
   now() - interval '400 days', now() - interval '400 days', now() - interval '1 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Ahmed Ben Ali","phone":"+21620000001"}',
   now() - interval '400 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000002',
   'authenticated', 'authenticated', 'sami@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '380 days', now() - interval '380 days', now() - interval '3 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Sami Trabelsi","phone":"+21620000002"}',
   now() - interval '380 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000003',
   'authenticated', 'authenticated', 'karim@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '350 days', now() - interval '350 days', now() - interval '18 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Karim Gharbi","phone":"+21620000003"}',
   now() - interval '350 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000004',
   'authenticated', 'authenticated', 'yassine@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '300 days', now() - interval '300 days', now() - interval '2 days',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Yassine Zayani","phone":"+21620000004"}',
   now() - interval '300 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000005',
   'authenticated', 'authenticated', 'nadia@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '60 days', now() - interval '60 days', now() - interval '5 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Nadia Chaabane","phone":"+21620000005"}',
   now() - interval '60 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000006',
   'authenticated', 'authenticated', 'farid@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '250 days', now() - interval '250 days', now() - interval '10 days',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Farid Karray","phone":"+21620000006"}',
   now() - interval '250 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000007',
   'authenticated', 'authenticated', 'sana@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '1 days', now() - interval '1 days', now() - interval '1 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Sana Mejri","phone":"+21620000007"}',
   now() - interval '1 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000008',
   'authenticated', 'authenticated', 'superadmin@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '500 days', now() - interval '500 days', now() - interval '1 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Yosr Admin Ben Salah"}',
   now() - interval '500 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000009',
   'authenticated', 'authenticated', 'admin@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '400 days', now() - interval '400 days', now() - interval '2 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Rania Admin Jouini"}',
   now() - interval '400 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-000000000010',
   'authenticated', 'authenticated', 'support@dala.tn', crypt('Test1234!', gen_salt('bf')),
   now() - interval '200 days', now() - interval '200 days', now() - interval '6 hours',
   '{"provider":"email","providers":["email"]}',
   '{"full_name":"Mehdi Support Ayari"}',
   now() - interval '200 days', now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email), 'email',
       now(), now(), now()
from auth.users u
where u.id in (
  '22222222-2222-2222-2222-000000000001', '22222222-2222-2222-2222-000000000002',
  '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000004',
  '22222222-2222-2222-2222-000000000005', '22222222-2222-2222-2222-000000000006',
  '22222222-2222-2222-2222-000000000007', '22222222-2222-2222-2222-000000000008',
  '22222222-2222-2222-2222-000000000009', '22222222-2222-2222-2222-000000000010'
)
on conflict (provider, provider_id) do nothing;

-- ---------------------------------------------------------------------------
-- Part 2 — organizations + membership
-- ---------------------------------------------------------------------------

insert into organizations (
  id, name, trade_type, logo_url, address, contact_phone, contact_email,
  matricule_fiscal, rc_number, plan, org_checklist_dismissed_at, created_by,
  created_at, updated_at, suspended_at, deleted_at,
  subscription_status, billing_cycle_start, seat_price_millimes,
  workforce_size_bracket, facebook_url, instagram_url, website_url,
  service_area, verification_status, rib_last4, onboarding_dismissed_at
) values
  ('11111111-1111-1111-1111-000000000001', 'Plomberie Ben Ali', 'Plomberie',
   'org-files/11111111-1111-1111-1111-000000000001/logo/logo.png',
   'Rue Ibn Khaldoun, Ariana', '+21671000001', 'contact@benali-plomberie.tn',
   '1234567A', 'B012345678', 'pro', now() - interval '390 days', '22222222-2222-2222-2222-000000000001',
   now() - interval '400 days', now() - interval '1 days', null, null,
   'active', date_trunc('month', current_date)::date, 15000,
   '11_50', 'https://facebook.com/benaliplomberie', 'https://instagram.com/benaliplomberie', 'https://benali-plomberie.tn',
   'Grand Tunis', 'verified', '4821', now() - interval '395 days'),
  ('11111111-1111-1111-1111-000000000002', 'Élec Zayani', 'Électricité',
   null, 'Avenue Habib Bourguiba, Sousse', '+21673000002', 'contact@zayani-elec.tn',
   '7654321B', 'B087654321', 'free', null, '22222222-2222-2222-2222-000000000004',
   now() - interval '300 days', now() - interval '5 days', null, null,
   'trialing', current_date - interval '4 days', 15000,
   '2_10', null, null, null,
   'Sahel', 'unverified', null, now() - interval '250 days'),
  ('11111111-1111-1111-1111-000000000003', 'Menuiserie Karray', 'Menuiserie',
   null, 'Route de Gremda, Sfax', '+21674000003', 'contact@karray-menuiserie.tn',
   '9988776C', 'B055667788', 'free', now() - interval '100 days', '22222222-2222-2222-2222-000000000006',
   now() - interval '250 days', now() - interval '35 days', null, null,
   'past_due', current_date - interval '35 days', 15000,
   '1', null, null, null,
   'Sfax', 'unverified', null, now() - interval '200 days'),
  ('11111111-1111-1111-1111-000000000004', 'Climatisation Cap Bon', 'Climatisation',
   null, 'Route Touristique, Nabeul', '+21672000004', 'contact@capbon-clim.tn',
   null, null, 'free', null, '22222222-2222-2222-2222-000000000007',
   now() - interval '1 days', now() - interval '1 days', null, null,
   'trialing', current_date, 15000,
   null, null, null, null,
   null, 'unverified', null, null)
on conflict (id) do nothing;

insert into organization_members (org_id, user_id, role, joined_at) values
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'owner', now() - interval '400 days'),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000002', 'manager', now() - interval '380 days'),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000005', 'viewer', now() - interval '58 days'),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000004', 'owner', now() - interval '300 days'),
  ('11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000006', 'owner', now() - interval '250 days'),
  ('11111111-1111-1111-1111-000000000004', '22222222-2222-2222-2222-000000000007', 'owner', now() - interval '1 days')
on conflict (org_id, user_id) do nothing;

-- Karim (worker self-access) also needs active_org_id set, even though he
-- has no organization_members row — he authenticates as a worker, not an
-- org member. Same for the platform admins (no active_org_id at all).
update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000001',
  preferred_locale = 'fr',
  avatar_url = null,
  profile_checklist_dismissed_at = now() - interval '390 days',
  last_login_at = now() - interval '1 hours',
  last_login_platform = 'mobile',
  expo_push_token = 'ExponentPushToken[seed-ahmed-token]',
  emergency_contact_name = 'Leila Ben Ali',
  emergency_contact_phone = '+21698000101'
where id = '22222222-2222-2222-2222-000000000001';

update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000001',
  profile_checklist_dismissed_at = now() - interval '370 days',
  last_login_at = now() - interval '3 hours',
  last_login_platform = 'mobile',
  expo_push_token = 'ExponentPushToken[seed-sami-token]'
where id = '22222222-2222-2222-2222-000000000002';

update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000001',
  last_login_at = now() - interval '18 hours',
  last_login_platform = 'mobile',
  expo_push_token = 'ExponentPushToken[seed-karim-token]',
  emergency_contact_name = 'Salma Gharbi',
  emergency_contact_phone = '+21698000103'
where id = '22222222-2222-2222-2222-000000000003';

update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000002',
  last_login_at = now() - interval '2 days',
  last_login_platform = 'web'
where id = '22222222-2222-2222-2222-000000000004';

update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000001',
  last_login_at = now() - interval '5 hours',
  last_login_platform = 'mobile'
where id = '22222222-2222-2222-2222-000000000005';

update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000003',
  last_login_at = now() - interval '10 days',
  last_login_platform = 'web'
where id = '22222222-2222-2222-2222-000000000006';

update profiles set
  active_org_id = '11111111-1111-1111-1111-000000000004',
  last_login_at = now() - interval '1 hours',
  last_login_platform = 'mobile'
where id = '22222222-2222-2222-2222-000000000007';

-- deletion_requested_at scenario: karim considered leaving, backed out —
-- left null. sami is the account exercising MFA recovery codes (Part 12).

-- ---------------------------------------------------------------------------
-- Part 3 — workers
-- Karim is both a login account (Part 1) AND a worker row, linked via
-- user_id, for testing the worker self-access screens (Pointage, salary
-- view, material-request). Mohamed and Fedi are org-1 workers with no
-- login yet — Fedi has a pending invitation (Part 13); Sofien is
-- soft-deleted (Trash screen). Walid belongs to org 2. Org 3 (past_due,
-- free-tier caps) sits at exactly 3 workers. Org 4 (brand new) has none yet.
-- ---------------------------------------------------------------------------

insert into workers (
  id, org_id, full_name, phone, trade, daily_rate, user_id, created_at,
  email, deleted_at, photo_url, job_title, hire_date
) values
  ('44444444-4444-4444-4444-000000000001', '11111111-1111-1111-1111-000000000001',
   'Karim Gharbi', '+21620000003', 'Plombier', 60.00, '22222222-2222-2222-2222-000000000003',
   now() - interval '350 days', 'karim@dala.tn', null, null, 'Chef d''équipe plomberie', current_date - interval '350 days'),
  ('44444444-4444-4444-4444-000000000002', '11111111-1111-1111-1111-000000000001',
   'Mohamed Sassi', '+21622111222', 'Plombier', 55.00, null,
   now() - interval '300 days', null, null,
   'org-files/11111111-1111-1111-1111-000000000001/worker-photo/mohamed.jpg', 'Plombier', current_date - interval '300 days'),
  ('44444444-4444-4444-4444-000000000003', '11111111-1111-1111-1111-000000000001',
   'Fedi Jlassi', '+21655333444', 'Aide', 40.00, null,
   now() - interval '90 days', null, null, null, 'Aide plombier', current_date - interval '90 days'),
  ('44444444-4444-4444-4444-000000000005', '11111111-1111-1111-1111-000000000001',
   'Sofien Malek', '+21655999888', 'Plombier', 58.00, null,
   now() - interval '500 days', null, now() - interval '10 days', null, 'Plombier', current_date - interval '500 days'),
  ('44444444-4444-4444-4444-000000000004', '11111111-1111-1111-1111-000000000002',
   'Walid Hammami', '+21698777666', 'Électricien', 65.00, null,
   now() - interval '280 days', null, null, null, 'Électricien', current_date - interval '280 days'),
  ('44444444-4444-4444-4444-000000000006', '11111111-1111-1111-1111-000000000003',
   'Anis Karray', '+21698111222', 'Menuisier', 50.00, null,
   now() - interval '240 days', null, null, null, 'Menuisier', current_date - interval '240 days'),
  ('44444444-4444-4444-4444-000000000007', '11111111-1111-1111-1111-000000000003',
   'Hedi Chtioui', '+21698222333', 'Menuisier', 48.00, null,
   now() - interval '220 days', null, null, null, 'Menuisier', current_date - interval '220 days'),
  ('44444444-4444-4444-4444-000000000008', '11111111-1111-1111-1111-000000000003',
   'Ines Baccouche', '+21698333444', 'Aide', 35.00, null,
   now() - interval '200 days', null, null, null, 'Aide menuisier', current_date - interval '200 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Part 4 — projects
-- Org 1: one of every status, plus a soft-deleted one for Trash, plus a
-- cover photo on one project. Org 3 sits at exactly 3 active projects
-- (the free-tier cap, migration 0044) so its own dashboard should show the
-- cap reached / block a 4th. Org 4 has none yet (first-run empty state).
-- ---------------------------------------------------------------------------

insert into projects (
  id, lead_org_id, name, client_name, address, budget_total, status,
  deleted_at, version, created_by, created_at, updated_at,
  start_date, project_type, cover_photo_url
) values
  ('33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000001',
   'Villa Ariana', 'Famille Khelifi', 'Ariana Ville', 150000.00, 'active',
   null, 1, '22222222-2222-2222-2222-000000000001', now() - interval '20 days', now() - interval '1 days',
   current_date - interval '20 days', 'residentiel',
   'org-files/11111111-1111-1111-1111-000000000001/project-cover/villa-ariana.jpg'),
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000001',
   'Immeuble Sousse', 'Promoteur SCI Yosr', 'Sousse Corniche', 500000.00, 'active',
   null, 1, '22222222-2222-2222-2222-000000000001', now() - interval '60 days', now() - interval '2 days',
   current_date - interval '60 days', 'commercial', null),
  ('33333333-3333-3333-3333-000000000003', '11111111-1111-1111-1111-000000000001',
   'Rénovation Bureau Centre-Ville', 'Cabinet Trabelsi', 'Tunis Centre', 45000.00, 'completed',
   null, 1, '22222222-2222-2222-2222-000000000001', now() - interval '200 days', now() - interval '30 days',
   current_date - interval '200 days', 'renovation', null),
  ('33333333-3333-3333-3333-000000000005', '11111111-1111-1111-1111-000000000001',
   'Lotissement El Menzah — Phase 1', 'Promoteur Ennaceur', 'El Menzah, Tunis', 800000.00, 'archived',
   null, 1, '22222222-2222-2222-2222-000000000001', now() - interval '500 days', now() - interval '180 days',
   current_date - interval '500 days', 'infrastructure', null),
  ('33333333-3333-3333-3333-000000000004', '11111111-1111-1111-1111-000000000001',
   'Ancien Chantier Annulé', 'Client retiré', 'La Marsa', 30000.00, 'active',
   now() - interval '2 days', 1, '22222222-2222-2222-2222-000000000001', now() - interval '90 days', now() - interval '2 days',
   current_date - interval '90 days', 'residentiel', null),
  ('33333333-3333-3333-3333-000000000006', '11111111-1111-1111-1111-000000000003',
   'Cuisine sur mesure — Villa Sfax', 'M. et Mme Trabelsi', 'Route de Gremda, Sfax', 12000.00, 'active',
   null, 1, '22222222-2222-2222-2222-000000000006', now() - interval '40 days', now() - interval '3 days',
   current_date - interval '40 days', 'residentiel', null),
  ('33333333-3333-3333-3333-000000000007', '11111111-1111-1111-1111-000000000003',
   'Mobilier de bureau — Cabinet Notarial', 'Maître Ben Youssef', 'Sfax Centre', 8000.00, 'active',
   null, 1, '22222222-2222-2222-2222-000000000006', now() - interval '20 days', now() - interval '5 days',
   current_date - interval '20 days', 'commercial', null),
  ('33333333-3333-3333-3333-000000000008', '11111111-1111-1111-1111-000000000003',
   'Placards intégrés — Résidence Karray', 'Farid Karray (interne)', 'Sfax', 5000.00, 'completed',
   null, 1, '22222222-2222-2222-2222-000000000006', now() - interval '150 days', now() - interval '100 days',
   current_date - interval '150 days', 'residentiel', null)
on conflict (id) do nothing;

-- Élec Zayani (org 2) is a trade partner on the Sousse project — multi-org
-- collaboration / cross-org rollup testing. Only the trade org gets a
-- project_memberships row here — the lead org (org 1) must NOT get one:
-- migration 0034's is_project_participant() explicitly documents that a
-- lead org's own projects have no project_memberships row at all.
insert into project_memberships (project_id, org_id, role, budget_rollup_opt_in, created_at, report_branding_opt_out) values
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000002', 'trade', true, now() - interval '55 days', false)
on conflict (project_id, org_id) do nothing;

-- ---------------------------------------------------------------------------
-- Part 5 — vehicles, dispatch, maintenance log, documents
-- Vehicle 3 is soft-deleted (UndoToast/Trash testing). Vehicle 1 has a
-- maintenance-log entry and three documents: valid, due-soon, expired
-- (expiryProgressPercent color-threshold testing). Dispatch includes a
-- same-day double-booking of Mohamed across two projects (conflict-sheet
-- testing).
-- ---------------------------------------------------------------------------

insert into vehicles (id, org_id, name, plate, capacity, status, created_at, photo_url, version, deleted_at) values
  ('55555555-5555-5555-5555-000000000001', '11111111-1111-1111-1111-000000000001',
   'Camionnette 1', '123 TUN 4567', 3, 'available', now() - interval '400 days',
   'org-files/11111111-1111-1111-1111-000000000001/vehicle-photo/camionnette1.jpg', 1, null),
  ('55555555-5555-5555-5555-000000000002', '11111111-1111-1111-1111-000000000001',
   'Camionnette 2', '789 TUN 1234', 2, 'in_use', now() - interval '350 days', null, 1, null),
  ('55555555-5555-5555-5555-000000000003', '11111111-1111-1111-1111-000000000001',
   'Vieille Camionnette', '456 TUN 8888', 2, 'maintenance', now() - interval '600 days', null, 2, now() - interval '5 days'),
  ('55555555-5555-5555-5555-000000000004', '11111111-1111-1111-1111-000000000003',
   'Camionnette Menuiserie', '321 TUN 5555', 2, 'available', now() - interval '200 days', null, 1, null)
on conflict (id) do nothing;

insert into vehicle_maintenance_log (org_id, vehicle_id, log_date, description, cost, logged_by, created_at) values
  ('11111111-1111-1111-1111-000000000001', '55555555-5555-5555-5555-000000000001',
   current_date - interval '30 days', 'Vidange + filtre à huile', 120.00, '22222222-2222-2222-2222-000000000001', now() - interval '30 days'),
  ('11111111-1111-1111-1111-000000000001', '55555555-5555-5555-5555-000000000001',
   current_date - interval '5 days', 'Changement pneus avant', 340.00, '22222222-2222-2222-2222-000000000002', now() - interval '5 days'),
  ('11111111-1111-1111-1111-000000000001', '55555555-5555-5555-5555-000000000003',
   current_date - interval '4 days', 'Diagnostic panne moteur', 80.00, '22222222-2222-2222-2222-000000000001', now() - interval '4 days')
on conflict do nothing;

insert into vehicle_documents (org_id, vehicle_id, document_type, document_url, expires_at, recorded_by, created_at) values
  ('11111111-1111-1111-1111-000000000001', '55555555-5555-5555-5555-000000000001',
   'Assurance', 'org-files/11111111-1111-1111-1111-000000000001/vehicle-doc/assurance-camionnette1.pdf', current_date + interval '200 days', '22222222-2222-2222-2222-000000000001', now() - interval '165 days'),
  ('11111111-1111-1111-1111-000000000001', '55555555-5555-5555-5555-000000000001',
   'Visite technique', 'org-files/11111111-1111-1111-1111-000000000001/vehicle-doc/visite-camionnette1.pdf', current_date + interval '12 days', '22222222-2222-2222-2222-000000000001', now() - interval '350 days'),
  ('11111111-1111-1111-1111-000000000001', '55555555-5555-5555-5555-000000000002',
   'Assurance', 'org-files/11111111-1111-1111-1111-000000000001/vehicle-doc/assurance-camionnette2.pdf', current_date - interval '15 days', '22222222-2222-2222-2222-000000000002', now() - interval '380 days')
on conflict do nothing;

insert into dispatch_assignments (org_id, project_id, vehicle_id, worker_id, assignment_date, departure_time, confirmation_channel, actual_departure_time, version) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   '55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000001',
   current_date, '07:00', 'app', '07:22', 1),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   '55555555-5555-5555-5555-000000000002', '44444444-4444-4444-4444-000000000002',
   current_date, '07:00', 'whatsapp', '07:05', 1),
  -- Conflict scenario: Mohamed also dispatched to a second project the same day.
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   '55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000002',
   current_date, '13:00', 'call', null, 1),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   '55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-000000000001',
   current_date + 1, '07:00', null, null, 1),
  ('11111111-1111-1111-1111-000000000003', '33333333-3333-3333-3333-000000000006',
   '55555555-5555-5555-5555-000000000004', '44444444-4444-4444-4444-000000000006',
   current_date, '08:00', 'app', '08:10', 1)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 6 — attendance, advances, expenses, salary cycles
-- Includes an explicit correction pair (same worker+date: a dispatch
-- check-in followed by a later manual_pointage correction) so
-- AttendanceHistory's "Corrigé" detection and the attendance_effective
-- view (migration 0036) have a real conflict row to resolve.
-- ---------------------------------------------------------------------------

insert into attendance_records (org_id, worker_id, project_id, record_date, status, source, recorded_by, created_at, absence_reason) values
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 7, 'present', 'dispatch_checkin', null, now() - interval '7 days', null),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 6, 'present', 'dispatch_checkin', null, now() - interval '6 days', null),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 5, 'absent', 'manual_pointage', '22222222-2222-2222-2222-000000000002', now() - interval '5 days', 'Maladie'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', '33333333-3333-3333-3333-000000000001', current_date - 3, 'present', 'dispatch_checkin', null, now() - interval '3 days', null),
  -- Correction pair: Mohamed's dispatch check-in said absent, contractor corrected it to present later the same day.
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000002', current_date - 4, 'absent', 'dispatch_checkin', null, now() - interval '4 days' - interval '10 hours', null),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000002', current_date - 4, 'present', 'manual_pointage', '22222222-2222-2222-2222-000000000001', now() - interval '4 days', null),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', '33333333-3333-3333-3333-000000000002', current_date - 3, 'half_day', 'manual_pointage', '22222222-2222-2222-2222-000000000002', now() - interval '3 days', null),
  ('11111111-1111-1111-1111-000000000003', '44444444-4444-4444-4444-000000000006', '33333333-3333-3333-3333-000000000006', current_date - 2, 'present', 'dispatch_checkin', null, now() - interval '2 days', null),
  ('11111111-1111-1111-1111-000000000003', '44444444-4444-4444-4444-000000000007', '33333333-3333-3333-3333-000000000007', current_date - 2, 'absent', 'manual_pointage', '22222222-2222-2222-2222-000000000006', now() - interval '2 days', 'Absence non justifiée')
on conflict do nothing;

insert into advances (org_id, worker_id, amount, reason, status, requested_by, approved_by, idempotency_key, created_at) values
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', 150.00,
   'Avance pour transport', 'approved', '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000001', gen_random_uuid(), now() - interval '12 days'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', 80.00,
   'Avance urgente', 'pending', null, null, gen_random_uuid(), now() - interval '1 days'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000003', 50.00,
   'Avance refusée — pas assez d''ancienneté', 'rejected', null, '22222222-2222-2222-2222-000000000001', gen_random_uuid(), now() - interval '20 days'),
  ('11111111-1111-1111-1111-000000000003', '44444444-4444-4444-4444-000000000006', 100.00,
   'Avance sur salaire', 'approved', null, '22222222-2222-2222-2222-000000000006', gen_random_uuid(), now() - interval '15 days')
on conflict do nothing;

insert into project_expenses (org_id, project_id, category, amount, description, receipt_photo_url, expense_date, created_by, created_at, deleted_at) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'materiaux', 4200.00, 'Tuyauterie PVC et raccords', 'org-files/11111111-1111-1111-1111-000000000001/expense-receipt/tuyauterie.jpg', current_date - 10, '22222222-2222-2222-2222-000000000001', now() - interval '10 days', null),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'carburant', 300.00, 'Essence camionnette', null, current_date - 5, '22222222-2222-2222-2222-000000000002', now() - interval '5 days', null),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002', 'sous_traitance', 15000.00, 'Sous-traitant maçonnerie', null, current_date - 15, '22222222-2222-2222-2222-000000000001', now() - interval '15 days', null),
  -- Soft-deleted expense (UndoToast / restore testing, migration 0076).
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'autre', 60.00, 'Erreur de saisie — supprimée', null, current_date - 2, '22222222-2222-2222-2222-000000000002', now() - interval '2 days', now() - interval '1 days'),
  ('11111111-1111-1111-1111-000000000003', '33333333-3333-3333-3333-000000000006', 'materiaux', 900.00, 'Bois de chêne', null, current_date - 8, '22222222-2222-2222-2222-000000000006', now() - interval '8 days', null)
on conflict do nothing;

insert into salary_cycles (org_id, worker_id, cycle_start, cycle_end, status, paid_at, idempotency_key, created_at) values
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', current_date - 14, current_date - 8, 'paid', now() - interval '7 days', gen_random_uuid(), now() - interval '8 days'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000001', current_date - 7, current_date - 1, 'pending', null, gen_random_uuid(), now() - interval '1 days'),
  ('11111111-1111-1111-1111-000000000001', '44444444-4444-4444-4444-000000000002', current_date - 7, current_date - 1, 'pending', null, gen_random_uuid(), now() - interval '1 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 7 — materials, site_logs, safety_incidents (+ worker links), org_insurances
-- One approved material has a cost, manually mirrored into project_expenses
-- (materials.cost does NOT auto-push via trigger — only approve_material_request()
-- does that at runtime — so the matching expense row is inserted by hand here
-- to represent the post-approval state a real approve would have produced).
-- ---------------------------------------------------------------------------

insert into materials (id, org_id, project_id, item, quantity, urgency, note, status, rejection_reason, created_by, approved_by, created_at, assigned_worker_id, cost) values
  ('77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   'Ciment (sacs 50kg)', 40, 'urgent', 'Besoin avant vendredi', 'approved', null,
   '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000001', now() - interval '9 days',
   '44444444-4444-4444-4444-000000000001', 680.00),
  ('77777777-7777-7777-7777-000000000002', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   'Câbles électriques 2.5mm', 200, 'normal', null, 'pending', null,
   '22222222-2222-2222-2222-000000000002', null, now() - interval '2 days', null, null),
  ('77777777-7777-7777-7777-000000000003', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   'Robinetterie de luxe', 6, 'normal', 'Modèle non disponible chez le fournisseur habituel', 'rejected',
   'Trop cher — chercher une alternative', '22222222-2222-2222-2222-000000000003', '22222222-2222-2222-2222-000000000001', now() - interval '25 days', null, null),
  ('77777777-7777-7777-7777-000000000004', '11111111-1111-1111-1111-000000000003', '33333333-3333-3333-3333-000000000006',
   'Vernis bois', 10, 'normal', null, 'pending', null,
   '22222222-2222-2222-2222-000000000006', null, now() - interval '1 days', null, null)
on conflict (id) do nothing;

-- Manual mirror of what approve_material_request() would have pushed for
-- the ciment request above (cost=680, project set) — expense row already
-- covered structurally by Part 6, kept here as a comment for traceability:
-- see project_expenses row 'materiaux' / 4200.00 is unrelated stock, this
-- 680.00 ciment-approval expense is added below.
insert into project_expenses (org_id, project_id, category, amount, description, expense_date, created_by, created_at) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'materiaux', 680.00,
   'Ciment (sacs 50kg) — approuvé via demande matériaux', current_date - 9, '22222222-2222-2222-2222-000000000001', now() - interval '9 days')
on conflict do nothing;

insert into site_logs (id, org_id, project_id, photo_url, caption, logged_by, created_at, voice_note_url, note_text, thumbnail_url, location_lat, location_lng, deleted_at) values
  ('88888888-8888-8888-8888-000000000001', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   'org-files/11111111-1111-1111-1111-000000000001/site-log/photo1.jpg', 'Coulage de la dalle terminé', '22222222-2222-2222-2222-000000000001',
   now() - interval '6 days', null, null, 'org-files/11111111-1111-1111-1111-000000000001/site-log/thumb1.jpg', 36.862500, 10.195500, null),
  ('88888888-8888-8888-8888-000000000002', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   null, 'Note vocale — retard livraison ciment', '22222222-2222-2222-2222-000000000002',
   now() - interval '4 days', 'org-files/11111111-1111-1111-1111-000000000001/site-log/voice1.m4a', 'Retard livraison ciment, prévoir 2 jours de plus', null, null, null, null),
  ('88888888-8888-8888-8888-000000000003', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   'org-files/11111111-1111-1111-1111-000000000001/site-log/photo2.jpg', 'Charpente métallique posée', '22222222-2222-2222-2222-000000000001',
   now() - interval '10 days', null, null, null, null, null, null),
  -- Soft-deleted (30-day recoverable, migration 0072) journal entry.
  ('88888888-8888-8888-8888-000000000004', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   'org-files/11111111-1111-1111-1111-000000000001/site-log/photo3.jpg', 'Doublon supprimé par erreur', '22222222-2222-2222-2222-000000000002',
   now() - interval '3 days', null, null, null, null, null, now() - interval '1 days'),
  ('88888888-8888-8888-8888-000000000005', '11111111-1111-1111-1111-000000000003', '33333333-3333-3333-3333-000000000006',
   'org-files/11111111-1111-1111-1111-000000000003/site-log/photo1.jpg', 'Découpe des panneaux de chêne', '22222222-2222-2222-2222-000000000006',
   now() - interval '5 days', null, null, null, null, null, null)
on conflict (id) do nothing;

insert into safety_incidents (id, org_id, project_id, description, severity, photo_url, reported_by, created_at, location, incident_type) values
  ('99999999-9999-9999-9999-000000000001', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   'Petite coupure au doigt, premiers soins appliqués', 'minor', null, '22222222-2222-2222-2222-000000000001',
   now() - interval '15 days', 'Zone plomberie, RDC', 'blessure_legere'),
  ('99999999-9999-9999-9999-000000000002', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   'Chute d''un échafaudage mal fixé, entorse à la cheville', 'moderate',
   'org-files/11111111-1111-1111-1111-000000000001/safety/incident2.jpg', '22222222-2222-2222-2222-000000000002',
   now() - interval '8 days', 'Étage 2, façade nord', 'chute'),
  ('99999999-9999-9999-9999-000000000003', '11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   'Effondrement partiel d''un mur non porteur, un ouvrier hospitalisé', 'severe',
   'org-files/11111111-1111-1111-1111-000000000001/safety/incident3.jpg', '22222222-2222-2222-2222-000000000001',
   now() - interval '2 days', 'Rez-de-chaussée, aile est', 'effondrement')
on conflict (id) do nothing;

insert into safety_incident_workers (incident_id, worker_id) values
  ('99999999-9999-9999-9999-000000000001', '44444444-4444-4444-4444-000000000001'),
  ('99999999-9999-9999-9999-000000000002', '44444444-4444-4444-4444-000000000002'),
  ('99999999-9999-9999-9999-000000000003', '44444444-4444-4444-4444-000000000002'),
  ('99999999-9999-9999-9999-000000000003', '44444444-4444-4444-4444-000000000001')
on conflict do nothing;

insert into org_insurances (org_id, provider_name, policy_number, document_url, expires_at, created_at, reminder_enabled) values
  ('11111111-1111-1111-1111-000000000001', 'STAR Assurances', 'POL-2024-778812',
   'org-files/11111111-1111-1111-1111-000000000001/insurance/star-police.pdf', current_date + interval '10 days', now() - interval '355 days', true),
  ('11111111-1111-1111-1111-000000000001', 'GAT Assurances', 'POL-2022-114455',
   'org-files/11111111-1111-1111-1111-000000000001/insurance/gat-police.pdf', current_date - interval '20 days', now() - interval '720 days', true),
  ('11111111-1111-1111-1111-000000000003', 'Comar Assurances', 'POL-2023-556677',
   null, current_date + interval '90 days', now() - interval '200 days', false)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 8 — client portals, invoices, invitations (project/org-member/worker),
-- phone-change request, MFA recovery codes
-- ---------------------------------------------------------------------------

insert into client_portals (org_id, project_id, link_token, pin_enabled, pin_hash, failed_pin_attempts, locked_until, last_reset_at, last_reset_by, created_at, updated_at) values
  -- Working portal, PIN-protected, no lockout — the "everything fine" case.
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001',
   'cp_villa_ariana_9f8e7d6c', true, crypt('1234', gen_salt('bf')), 0, null, null, null, now() - interval '18 days', now() - interval '18 days'),
  -- Locked-out portal: 5 failed attempts, locked 10 minutes from now — lockout-flow testing.
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002',
   'cp_immeuble_sousse_1a2b3c4d', true, crypt('5678', gen_salt('bf')), 5, now() + interval '10 minutes', now() - interval '55 days', '22222222-2222-2222-2222-000000000001', now() - interval '55 days', now() - interval '2 minutes'),
  -- Portal with PIN disabled — open link, no PIN gate.
  ('11111111-1111-1111-1111-000000000003', '33333333-3333-3333-3333-000000000006',
   'cp_cuisine_sfax_5e6f7g8h', false, null, 0, null, null, null, now() - interval '35 days', now() - interval '35 days')
on conflict (project_id) do nothing;

insert into invoices (org_id, project_id, invoice_number, issued_at, due_date, period_from, period_to, line_items, subtotal, notes, created_by, created_at) values
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000001', 'INV-2026-001',
   current_date - 20, current_date + 10, current_date - 50, current_date - 20,
   jsonb_build_array(
     jsonb_build_object('description', 'Tuyauterie PVC et raccords', 'category', 'materiaux', 'amount', 4200.00, 'expense_date', (current_date - 10)::text),
     jsonb_build_object('description', 'Essence camionnette', 'category', 'carburant', 'amount', 300.00, 'expense_date', (current_date - 5)::text)
   ),
   4500.00, 'Facture intermédiaire — Villa Ariana', '22222222-2222-2222-2222-000000000001', now() - interval '20 days'),
  ('11111111-1111-1111-1111-000000000001', '33333333-3333-3333-3333-000000000002', 'INV-2026-002',
   current_date - 5, current_date + 25, current_date - 60, current_date - 5,
   jsonb_build_array(
     jsonb_build_object('description', 'Sous-traitant maçonnerie', 'category', 'sous_traitance', 'amount', 15000.00, 'expense_date', (current_date - 15)::text)
   ),
   15000.00, null, '22222222-2222-2222-2222-000000000001', now() - interval '5 days')
on conflict (org_id, invoice_number) do nothing;

-- Project invitations: pending (org2 invited to a hypothetical 2nd collab
-- project), accepted (matches the existing org2 membership on Immeuble
-- Sousse), and expired.
insert into project_invitations (project_id, lead_org_id, invited_org_id, invited_phone, invited_email, trade_type, token, sent_via, status, created_by, sent_at, expires_at, accepted_at) values
  ('33333333-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000002',
   '+21673000002', 'contact@zayani-elec.tn', 'Électricité', 'pinv_accepted_9k8j7h6g', 'whatsapp', 'accepted',
   '22222222-2222-2222-2222-000000000001', now() - interval '58 days', now() - interval '51 days', now() - interval '55 days'),
  ('33333333-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000001', null,
   '+21699888777', null, 'Peinture', 'pinv_pending_4d3c2b1a', 'sms', 'pending',
   '22222222-2222-2222-2222-000000000001', now() - interval '2 days', now() + interval '5 days', null),
  ('33333333-3333-3333-3333-000000000003', '11111111-1111-1111-1111-000000000001', null,
   null, 'ancien-partenaire@example.tn', 'Carrelage', 'pinv_expired_7z6y5x4w', 'email', 'expired',
   '22222222-2222-2222-2222-000000000001', now() - interval '40 days', now() - interval '33 days', null)
on conflict (token) do nothing;

insert into organization_member_invitations (org_id, invited_email, role, token, status, created_by, sent_at, expires_at, accepted_at) values
  -- Accepted: this is how nadia actually joined (Part 2's organization_members row).
  ('11111111-1111-1111-1111-000000000001', 'nadia@dala.tn', 'viewer', 'omi_accepted_1q2w3e4r', 'accepted',
   '22222222-2222-2222-2222-000000000001', now() - interval '60 days', now() - interval '53 days', now() - interval '58 days'),
  ('11111111-1111-1111-1111-000000000001', 'futur-manager@example.tn', 'manager', 'omi_pending_5t6y7u8i', 'pending',
   '22222222-2222-2222-2222-000000000001', now() - interval '3 days', now() + interval '4 days', null),
  ('11111111-1111-1111-1111-000000000003', 'associe@karray-menuiserie.tn', 'manager', 'omi_expired_9o8i7u6y', 'expired',
   '22222222-2222-2222-2222-000000000006', now() - interval '45 days', now() - interval '38 days', null)
on conflict (token) do nothing;

insert into worker_invitations (worker_id, token, channel, status, sent_at, expires_at, accepted_at) values
  ('44444444-4444-4444-4444-000000000003', 'winv_pending_fedi_3f3f3f', 'whatsapp', 'pending', now() - interval '2 days', now() + interval '5 days', null),
  ('44444444-4444-4444-4444-000000000004', 'winv_expired_walid_4a4a4a', 'sms', 'expired', now() - interval '30 days', now() - interval '23 days', null)
on conflict (token) do nothing;

-- Ahmed has a pending phone-change (re-verification flow, migration 0028)
-- with the confirmation code 4821 (hashed) — try entering it in the app.
insert into phone_change_requests (user_id, new_phone, code_hash, attempt_count, expires_at, confirmed_at, created_at) values
  ('22222222-2222-2222-2222-000000000001', '+21620000099', crypt('4821', gen_salt('bf')), 1, now() + interval '9 minutes', null, now() - interval '1 minutes')
on conflict do nothing;

-- Sami has 2FA enrolled (client-side, via Supabase's native TOTP MFA —
-- not seedable here since auth.mfa_factors isn't part of this seed) with
-- a fresh 10-code recovery set, two already used.
insert into mfa_recovery_codes (user_id, code_hash, used_at, created_at) values
  ('22222222-2222-2222-2222-000000000002', crypt('AB12CD34', gen_salt('bf')), now() - interval '10 days', now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('EF56GH78', gen_salt('bf')), now() - interval '3 days', now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('IJ90KL12', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('MN34OP56', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('QR78ST90', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('UV12WX34', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('YZ56AB78', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('CD90EF12', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('GH34IJ56', gen_salt('bf')), null, now() - interval '90 days'),
  ('22222222-2222-2222-2222-000000000002', crypt('KL78MN90', gen_salt('bf')), null, now() - interval '90 days')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 9 — feature flags, app versions, billing cycles, feedback,
-- project_workers, idempotency keys, scheduled job runs, password reset audit
-- ---------------------------------------------------------------------------

insert into feature_flags (key, description, default_enabled, created_at, updated_at) values
  ('new_analytics_beta', 'Écran Analytics (Gap-Fix Phase 7) en accès anticipé', false, now() - interval '40 days', now() - interval '5 days'),
  ('client_invoicing_v2', 'Facturation client via portail (Gap-Fix Phase 9)', true, now() - interval '20 days', now() - interval '20 days'),
  ('weather_widget', 'Widget météo sur le tableau de bord', true, now() - interval '20 days', now() - interval '20 days')
on conflict (key) do nothing;

insert into organization_feature_flags (org_id, flag_key, enabled, updated_at) values
  ('11111111-1111-1111-1111-000000000001', 'new_analytics_beta', true, now() - interval '5 days')
on conflict (org_id, flag_key) do nothing;

insert into app_versions (platform, latest_version, min_supported_version, updated_at) values
  ('ios', '1.4.2', '1.2.0', now() - interval '10 days'),
  ('android', '1.4.1', '1.2.0', now() - interval '10 days')
on conflict (platform) do update set
  latest_version = excluded.latest_version,
  min_supported_version = excluded.min_supported_version,
  updated_at = excluded.updated_at;

insert into billing_cycles (org_id, cycle_start, cycle_end, seat_count, amount_millimes, payment_provider, external_ref, payment_url, status, created_at, paid_at) values
  ('11111111-1111-1111-1111-000000000001', date_trunc('month', current_date - interval '1 month')::date, date_trunc('month', current_date)::date - 1,
   2, 30000, 'konnect', 'konnect_ref_88221199', null, 'paid', now() - interval '30 days', now() - interval '28 days'),
  ('11111111-1111-1111-1111-000000000001', date_trunc('month', current_date)::date, date_trunc('month', current_date)::date + interval '1 month' - interval '1 day',
   2, 30000, 'konnect', 'konnect_ref_99332200', 'https://pay.konnect.network/seed-fake-link', 'pending', now() - interval '1 days', null),
  ('11111111-1111-1111-1111-000000000003', date_trunc('month', current_date - interval '1 month')::date, date_trunc('month', current_date)::date - 1,
   1, 15000, 'konnect', 'konnect_ref_55667788', null, 'failed', now() - interval '35 days', null)
on conflict do nothing;

insert into feedback (org_id, submitted_by, category, message, platform, app_version, created_at) values
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001', 'suggestion',
   'Ce serait bien de pouvoir exporter le journal de chantier en PDF avec toutes les photos.', 'mobile', '1.4.2', now() - interval '6 days'),
  ('11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000003', 'bug',
   'L''appli plante parfois quand je prends une photo avec peu de batterie.', 'mobile', '1.4.1', now() - interval '2 days'),
  ('11111111-1111-1111-1111-000000000002', '22222222-2222-2222-2222-000000000004', 'question',
   'Comment inviter un deuxième utilisateur dans mon organisation ?', 'web', null, now() - interval '10 days')
on conflict do nothing;

insert into project_workers (project_id, worker_id, org_id, added_at, added_by, removed_at, removed_by) values
  ('33333333-3333-3333-3333-000000000001', '44444444-4444-4444-4444-000000000001', '11111111-1111-1111-1111-000000000001', now() - interval '20 days', '22222222-2222-2222-2222-000000000001', null, null),
  ('33333333-3333-3333-3333-000000000001', '44444444-4444-4444-4444-000000000002', '11111111-1111-1111-1111-000000000001', now() - interval '20 days', '22222222-2222-2222-2222-000000000001', null, null),
  ('33333333-3333-3333-3333-000000000002', '44444444-4444-4444-4444-000000000002', '11111111-1111-1111-1111-000000000001', now() - interval '55 days', '22222222-2222-2222-2222-000000000001', now() - interval '10 days', '22222222-2222-2222-2222-000000000002'),
  ('33333333-3333-3333-3333-000000000006', '44444444-4444-4444-4444-000000000006', '11111111-1111-1111-1111-000000000003', now() - interval '38 days', '22222222-2222-2222-2222-000000000006', null, null)
on conflict do nothing;

insert into idempotency_keys (key, org_id, endpoint, request_hash, response_status, response_body, created_at) values
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000001', 'advances.create', 'sha256:6f8db599de986fab7a21625b7916589c', 200,
   '{"advance_id": "seed-example", "status": "pending"}', now() - interval '1 days'),
  (gen_random_uuid(), '11111111-1111-1111-1111-000000000001', 'materials.approve', 'sha256:9c1185a5c5e9fc54612808977ee8f548', 200,
   '{"material_id": "77777777-7777-7777-7777-000000000001", "expense_created": true}', now() - interval '9 days')
on conflict (key) do nothing;

insert into scheduled_job_runs (job_name, started_at, completed_at, status, error_message, retry_count) values
  ('expire_invitations', now() - interval '1 days', now() - interval '1 days' + interval '2 seconds', 'success', null, 0),
  ('send_payment_reminders', now() - interval '1 days', now() - interval '1 days' + interval '5 seconds', 'success', null, 0),
  ('weekly_salary_summaries', now() - interval '7 days', now() - interval '7 days' + interval '30 seconds', 'success', null, 0),
  ('cleanup_orphaned_files', now() - interval '2 days', null, 'failed', 'Storage API timeout after 30s', 2),
  ('purge_idempotency_keys', now() - interval '3 hours', now() - interval '3 hours' + interval '1 seconds', 'success', null, 0)
on conflict do nothing;

insert into password_reset_audit (user_id, requested_at, completed_at, ip_address, platform) values
  ('22222222-2222-2222-2222-000000000004', now() - interval '45 days', now() - interval '45 days' + interval '3 minutes', '41.226.12.55', 'web')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 10 — platform admin: accounts, sessions, approval requests, audit log
-- ---------------------------------------------------------------------------

insert into platform_admins (id, full_name, totp_enabled, allowed_ips, last_login_at, created_at, role, totp_secret) values
  ('22222222-2222-2222-2222-000000000008', 'Yosr Admin Ben Salah', true, array['41.226.0.0/16'], now() - interval '1 hours', now() - interval '500 days', 'super_admin', 'JBSWY3DPEHPK3PXP'),
  ('22222222-2222-2222-2222-000000000009', 'Rania Admin Jouini', true, null, now() - interval '2 hours', now() - interval '400 days', 'admin', 'KRSXG5CTMVRXEZLU'),
  ('22222222-2222-2222-2222-000000000010', 'Mehdi Support Ayari', false, null, now() - interval '6 hours', now() - interval '200 days', 'support', null)
on conflict (id) do nothing;

insert into admin_sessions (admin_id, created_at, last_active_at, expires_at, revoked_at, impersonating_user_id, impersonation_reason, impersonation_started_at, impersonation_expires_at, impersonation_urgent) values
  -- Active session, no impersonation.
  ('22222222-2222-2222-2222-000000000008', now() - interval '30 minutes', now() - interval '2 minutes', now() + interval '90 minutes', null, null, null, null, null, false),
  -- Expired session (never revoked, just past its 2h hard cap).
  ('22222222-2222-2222-2222-000000000009', now() - interval '3 hours', now() - interval '2 hours 5 minutes', now() - interval '1 hours', null, null, null, null, null, false),
  -- Explicitly revoked (logged out).
  ('22222222-2222-2222-2222-000000000010', now() - interval '1 days', now() - interval '23 hours', now() - interval '22 hours', now() - interval '23 hours', null, null, null, null, false),
  -- Currently impersonating a user, non-urgent notification queued.
  ('22222222-2222-2222-2222-000000000009', now() - interval '10 minutes', now() - interval '1 minutes', now() + interval '110 minutes',
   null, '22222222-2222-2222-2222-000000000006', 'Client a signalé un bug sur la facturation, reproduction nécessaire', now() - interval '8 minutes', now() + interval '7 minutes', false)
on conflict do nothing;

insert into admin_approval_requests (requested_by, sql_statement, reason, status, approved_by, created_at, resolved_at) values
  ('22222222-2222-2222-2222-000000000009',
   'update organizations set subscription_status = ''active'' where id = ''11111111-1111-1111-1111-000000000003'';',
   'Client a payé par virement bancaire hors Konnect, confirmé par email', 'pending', null, now() - interval '2 hours', null),
  ('22222222-2222-2222-2222-000000000010',
   'delete from feedback where id = ''00000000-0000-0000-0000-000000000000'';',
   'Spam évident soumis via le formulaire de feedback', 'executed', '22222222-2222-2222-2222-000000000008',
   now() - interval '5 days', now() - interval '5 days' + interval '20 minutes')
on conflict do nothing;

insert into audit_log (actor_id, actor_type, action, target_table, target_id, metadata, impersonated_user_id, impersonation_reason, created_at, org_id, ip_address) values
  ('22222222-2222-2222-2222-000000000008', 'platform_admin', 'admin.login', null, null,
   '{"method":"password+totp"}', null, null, now() - interval '1 hours', null, '41.226.10.20'),
  ('22222222-2222-2222-2222-000000000009', 'platform_admin', 'admin.login', null, null,
   '{"method":"password+totp"}', null, null, now() - interval '2 hours', null, '41.226.10.21'),
  ('22222222-2222-2222-2222-000000000010', 'platform_admin', 'admin.logout', null, null,
   '{}', null, null, now() - interval '23 hours', null, '41.226.10.22'),
  ('22222222-2222-2222-2222-000000000009', 'platform_admin', 'admin.impersonate_start', 'profiles', '22222222-2222-2222-2222-000000000006',
   '{"session_id_note":"see admin_sessions seed row"}', '22222222-2222-2222-2222-000000000006',
   'Client a signalé un bug sur la facturation, reproduction nécessaire', now() - interval '10 minutes',
   '11111111-1111-1111-1111-000000000003', '41.226.10.21'),
  ('22222222-2222-2222-2222-000000000008', 'platform_admin', 'org.restore', 'organizations', '11111111-1111-1111-1111-000000000003',
   '{"previous_deleted_at":"seed-example"}', null, null, now() - interval '35 days', '11111111-1111-1111-1111-000000000003', '41.226.10.20'),
  ('22222222-2222-2222-2222-000000000008', 'platform_admin', 'feature_flag.update', null, null,
   '{"key":"new_analytics_beta","org_id":"11111111-1111-1111-1111-000000000001","enabled":true}', null, null, now() - interval '5 days',
   '11111111-1111-1111-1111-000000000001', '41.226.10.20'),
  ('22222222-2222-2222-2222-000000000001', 'user', 'member.role_change', 'organization_members', '22222222-2222-2222-2222-000000000005',
   '{"new_role":"viewer"}', null, null, now() - interval '58 days', '11111111-1111-1111-1111-000000000001', null)
on conflict do nothing;

insert into announcements (created_by, message, channels, target_type, target_value, scheduled_for, published_at, estimated_recipient_count, created_at) values
  ('22222222-2222-2222-2222-000000000008',
   'Nouveau : facturation client directement depuis l''app ! Testez-la dès maintenant.',
   array['in_app', 'push'], 'all_users', null, null, now() - interval '4 days', 84, now() - interval '4 days'),
  ('22222222-2222-2222-2222-000000000009',
   'Maintenance planifiée dimanche 2h-4h du matin — l''app pourrait être indisponible.',
   array['in_app', 'email', 'push'], 'all_users', null, now() + interval '2 days', null, 84, now() - interval '1 days')
on conflict do nothing;

insert into announcement_deliveries (announcement_id, user_id, channel, status, created_at)
select a.id, p, 'push', 'sent', now() - interval '4 days'
from announcements a, unnest(array[
  '22222222-2222-2222-2222-000000000001'::uuid, '22222222-2222-2222-2222-000000000002'::uuid,
  '22222222-2222-2222-2222-000000000004'::uuid
]) as p
where a.message like 'Nouveau : facturation%'
on conflict (announcement_id, user_id, channel) do nothing;

insert into announcement_deliveries (announcement_id, user_id, channel, status, created_at)
select a.id, '22222222-2222-2222-2222-000000000003'::uuid, 'push', 'skipped_no_token', now() - interval '4 days'
from announcements a where a.message like 'Nouveau : facturation%'
on conflict (announcement_id, user_id, channel) do nothing;

insert into impersonation_notifications (admin_id, org_id, impersonated_user_id, reason, session_ended_at, send_after, sent_at, created_at) values
  ('22222222-2222-2222-2222-000000000009', '11111111-1111-1111-1111-000000000001', '22222222-2222-2222-2222-000000000001',
   'Vérification d''un bug de synchronisation signalé la semaine dernière', now() - interval '15 days', now() - interval '15 days', now() - interval '15 days' + interval '2 minutes', now() - interval '15 days'),
  ('22222222-2222-2222-2222-000000000008', '11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000006',
   'Investigation urgente — plainte client sur facturation double', now() - interval '1 hours', now() + interval '23 hours', null, now() - interval '1 hours')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Part 11 — observability: service health, edge function logs + rate limits,
-- TOTP key rotation state/log, platform metrics history, alert state,
-- email delivery events, admin notes
-- ---------------------------------------------------------------------------

insert into service_health_checks (service_name, status, latency_ms, error_message, checked_at) values
  ('supabase_auth', 'up', 88, null, now() - interval '5 minutes'),
  ('supabase_storage', 'up', 142, null, now() - interval '5 minutes'),
  ('supabase_realtime', 'up', 65, null, now() - interval '5 minutes'),
  ('resend', 'up', 210, null, now() - interval '5 minutes'),
  ('expo_push', 'down', null, 'Connection timeout after 5000ms', now() - interval '5 minutes'),
  ('expo_push', 'up', 340, null, now() - interval '10 minutes'),
  ('supabase_auth', 'up', 91, null, now() - interval '10 minutes')
on conflict do nothing;

insert into edge_function_invocations (function_name, status, duration_ms, error_message, org_id, invoked_at) values
  ('generate-report', 'success', 1240, null, '11111111-1111-1111-1111-000000000001', now() - interval '2 hours'),
  ('send-digest-notifications', 'success', 3800, null, null, now() - interval '6 hours'),
  ('export-org-data', 'error', 500, 'Storage upload failed: bucket quota exceeded', '11111111-1111-1111-1111-000000000003', now() - interval '1 days'),
  ('generate-invoice-pdf', 'success', 980, null, '11111111-1111-1111-1111-000000000001', now() - interval '20 days'),
  ('accept-worker-invitation', 'success', 210, null, '11111111-1111-1111-1111-000000000001', now() - interval '90 days')
on conflict do nothing;

insert into edge_function_rate_limits (rate_key, window_start, request_count) values
  ('accept-worker-invitation:token:winv_pending_fedi_3f3f3f', now() - interval '2 minutes', 1),
  ('accept-worker-invitation:ip:41.226.10.20', now() - interval '2 minutes', 3),
  ('accept-organization-invitation:ip:196.203.10.5', now() - interval '10 minutes', 1)
on conflict (rate_key) do update set window_start = excluded.window_start, request_count = excluded.request_count;

-- totp_encryption_key_state already has its single row inserted by
-- migration 0061 itself (id=true, current_version='v1') — nothing to seed.

insert into totp_key_rotation_log (old_key_version, new_key_version, status, admins_total, admins_reencrypted, error_message, started_at, completed_at) values
  ('v0', 'v1', 'success', 3, 3, null, now() - interval '180 days', now() - interval '180 days' + interval '4 minutes')
on conflict do nothing;

insert into platform_metrics_daily (snapshot_date, org_count, active_org_count, user_count, mrr_millimes, storage_bytes, project_count, site_log_count, expense_count, created_at) values
  (current_date - 6, 3, 2, 8, 30000, 210000000, 6, 4, 3, now() - interval '6 days'),
  (current_date - 5, 3, 2, 8, 30000, 235000000, 6, 5, 3, now() - interval '5 days'),
  (current_date - 4, 4, 2, 9, 30000, 260000000, 7, 6, 4, now() - interval '4 days'),
  (current_date - 3, 4, 2, 9, 30000, 290000000, 8, 7, 4, now() - interval '3 days'),
  (current_date - 2, 4, 3, 9, 45000, 305000000, 8, 8, 5, now() - interval '2 days'),
  (current_date - 1, 4, 3, 10, 45000, 320000000, 8, 8, 5, now() - interval '1 days'),
  (current_date, 4, 3, 10, 45000, 335000000, 8, 8, 6, now())
on conflict (snapshot_date) do nothing;

insert into admin_alert_state (entity_type, entity_name, alerted_at, updated_at) values
  ('service', 'expo_push', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('service', 'supabase_auth', null, now() - interval '10 minutes'),
  ('job', 'cleanup_orphaned_files', now() - interval '2 days', now() - interval '2 days')
on conflict (entity_type, entity_name) do nothing;

insert into email_delivery_events (resend_email_id, event_type, recipient, bounce_type, bounce_message, org_id, received_at) values
  ('resend_seed_msg_001', 'email.delivered', 'ahmed@dala.tn', null, null, '11111111-1111-1111-1111-000000000001', now() - interval '20 days'),
  ('resend_seed_msg_002', 'email.opened', 'ahmed@dala.tn', null, null, '11111111-1111-1111-1111-000000000001', now() - interval '20 days' + interval '3 hours'),
  ('resend_seed_msg_003', 'email.bounced', 'contact@ancien-partenaire.example', 'Permanent', 'Mailbox does not exist', null, now() - interval '40 days'),
  ('resend_seed_msg_004', 'email.delivered', 'yassine@dala.tn', null, null, '11111111-1111-1111-1111-000000000002', now() - interval '55 days')
on conflict do nothing;

insert into admin_notes (target_type, target_id, author_admin_id, body, created_at, updated_at) values
  ('org', '11111111-1111-1111-1111-000000000003', '22222222-2222-2222-2222-000000000009',
   'Client en retard de paiement depuis 35 jours. A été contacté par téléphone le 15, a promis un virement. À suivre.', now() - interval '5 days', now() - interval '5 days'),
  ('user', '22222222-2222-2222-2222-000000000006', '22222222-2222-2222-2222-000000000008',
   'Propriétaire de Menuiserie Karray, très réactif par téléphone mais n''utilise jamais l''email.', now() - interval '20 days', now() - interval '20 days')
on conflict do nothing;

