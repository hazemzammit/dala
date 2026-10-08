-- CI lint: only the allowlisted functions may be executable by anon (see the
-- rationale in migration 0100). Prints offenders; any output fails the job.
-- Usage:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/lint_anon_execute_allowlist.sql
-- Expected output: nothing. Any row printed = unexpected anon-executable function.
--
-- Extension-owned functions are EXCLUDED (see the `not exists` clause below).
-- An extension's functions are granted EXECUTE to PUBLIC by CREATE EXTENSION
-- itself, so revoking them the way 0100 does for our own functions is not
-- possible or meaningful: `alter extension ... update` would simply restore
-- them, and they are generic utility functions, not tenant data. This is not
-- hypothetical — `pg_trgm` is installed into `public` by
-- 0001_extensions_and_helpers.sql, so its 31 functions (similarity,
-- word_similarity, gtrgm_*, show_limit, gin_*_trgm, ...) were reported as
-- offenders on EVERY run, making this lint a permanent false positive that
-- failed the CI job unconditionally.
--
-- "Belongs to an extension" is detected the standard Postgres way — a
-- pg_depend row with deptype = 'e' (DEPENDENCY_EXTENSION) pointing at
-- pg_extension — rather than by hardcoding pg_trgm's function names, so this
-- stays correct for any extension installed into `public`, now or later.
select p.oid::regprocedure
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prokind = 'f'
  and p.prorettype <> 'trigger'::regtype
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and not exists (
    select 1
    from pg_depend d
    where d.objid = p.oid
      and d.classid = 'pg_proc'::regclass
      and d.refclassid = 'pg_extension'::regclass
      and d.deptype = 'e'
  )
  and p.proname <> all (array[
    'get_organization_member_invitation_by_token',
    'get_project_invitation_by_token',
    'get_worker_invitation_by_token',
    'verify_client_portal_access',
    'verify_client_portal_invoice',
    'get_org_logo_signed_url',
    'app_version_check',
    'health_check',
    'is_org_member', 'org_role_of', 'is_project_member', 'is_own_worker',
    'is_org_participant', 'is_project_active', 'is_project_participant',
    'is_worker_assigned_to_project', 'is_org_past_due',
    'has_active_project_capacity', 'has_active_worker_capacity', 'get_org_seat_count',
    -- 0112: the org-parameterized form of is_project_participant. Same category
    -- as the line above it — a pure RLS predicate, anon-reachable and returning
    -- false for anon because auth.uid() is NULL — so it belongs on this list,
    -- not in the denied set.
    'is_org_project_participant'
  ])
order by 1;
