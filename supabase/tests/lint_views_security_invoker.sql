-- CI lint: every view in `public` must be security_invoker, otherwise it runs
-- with its owner's rights and bypasses the RLS of the tables it reads (0102).
-- Prints offenders; any output fails the job.
select c.relname
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('v', 'm')
  and not coalesce('security_invoker=true' = any (c.reloptions), false)
order by 1;
