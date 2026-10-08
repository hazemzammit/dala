-- =============================================================================
-- 0105_account_deletion_fk_actions.sql
--
-- Audit finding (untested "Potential" in the first report — now reproduced):
-- ACCOUNT DELETION FAILED for any user who had ever created anything.
--
-- The delete-account Edge Function ends with auth.admin.deleteUser(), i.e.
-- DELETE FROM auth.users -> CASCADE -> DELETE FROM profiles. Twenty-four
-- columns reference profiles(id) with the default NO ACTION (projects.
-- created_by, project_expenses.created_by, advances.requested_by/approved_by,
-- site_logs.logged_by, materials.*, organizations.created_by, invoices.
-- created_by, ...), so the moment a user owned a single row of any of them the
-- delete raised a foreign-key violation and the function answered
-- "La suppression du compte a échoué. Réessayez." forever. Reproduced: a
-- manager who created one project could not be deleted; a user with no history
-- could. (Deleting your account in-app is also an app-store requirement.)
--
-- Fix — anonymise, don't delete the business record:
--   * every such FK becomes ON DELETE SET NULL (NOT NULL is dropped where
--     needed), so the organisation keeps its projects, expenses, logs and
--     payroll history, just without the departed user's attribution;
--   * impersonation_notifications (a notice addressed TO the user) is deleted
--     with the user instead;
--   * password_reset_audit.user_id (a FK straight to auth.users) is SET NULL.
-- platform_admins.id -> auth.users stays NO ACTION on purpose: a platform admin
-- must be demoted before their login can be removed.
--
-- The sole-owner rule is unchanged and still enforced by the function: you
-- cannot delete your account while you are the only owner of an organisation.
-- supabase/tests/lint_account_deletion_fks.sql (CI) keeps this from regressing.
-- =============================================================================

do $$
declare
  r record;
  v_action text;
begin
  for r in
    select c.conrelid::regclass as tbl,
           c.conname,
           a.attname,
           a.attnotnull
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype in ('a', 'r')          -- NO ACTION / RESTRICT
      and array_length(c.conkey, 1) = 1
  loop
    v_action := case when r.tbl::text = 'impersonation_notifications' then 'cascade' else 'set null' end;

    if v_action = 'set null' and r.attnotnull then
      execute format('alter table %s alter column %I drop not null', r.tbl, r.attname);
    end if;
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.profiles (id) on delete %s',
      r.tbl, r.conname, r.attname, v_action);
  end loop;
end $$;

-- password_reset_audit references auth.users directly.
do $$
declare
  v_name text;
  v_notnull boolean;
begin
  select c.conname, a.attnotnull into v_name, v_notnull
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.conrelid = 'public.password_reset_audit'::regclass
    and c.confrelid = 'auth.users'::regclass and c.confdeltype in ('a', 'r');
  if v_name is not null then
    if v_notnull then
      alter table public.password_reset_audit alter column user_id drop not null;
    end if;
    execute format('alter table public.password_reset_audit drop constraint %I', v_name);
    execute format(
      'alter table public.password_reset_audit add constraint %I foreign key (user_id) references auth.users (id) on delete set null',
      v_name);
  end if;
end $$;
