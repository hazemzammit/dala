-- CI lint: no foreign key may block deleting a user. Any FK to profiles(id) or
-- auth.users(id) with NO ACTION / RESTRICT stops the delete-account flow for
-- every user who has ever created a row (see migration 0105). platform_admins
-- is the deliberate exception. Prints offenders; any output fails the job.
select c.conrelid::regclass || '.' || a.attname as blocking_fk
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
where c.contype = 'f'
  and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
  and c.confdeltype in ('a', 'r')
  and c.conrelid <> 'public.platform_admins'::regclass
order by 1;
