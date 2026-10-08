-- CI lint: fails (returns rows) if any SECURITY DEFINER function in `public`
-- compares org_role_of() (or a variable assigned from it) without a
-- null-safe coalesce. This bug class shipped twice (0040, then 0093).
-- Usage:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -f supabase/tests/lint_null_unsafe_role_checks.sql
-- Expected output: nothing. Any row printed = failing function signature.
select p.oid::regprocedure
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.prosecdef
  and (
    -- direct comparison: org_role_of(x) <> 'a' / not in (...) / = 'a'
    pg_get_functiondef(p.oid) ~* 'org_role_of\([^()]*\)\s*(<>|!=|not\s+in)'
    -- variable assigned from org_role_of without coalesce, then compared
    or (pg_get_functiondef(p.oid) ~* ':=\s*org_role_of\(')
  )
order by 1;
