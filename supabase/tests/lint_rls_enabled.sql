-- CI lint: every ordinary/partitioned table in `public` must have RLS enabled.
-- (0094 fixed edge_function_rate_limits and totp_encryption_key_state, which
-- shipped without it and were fully writable by any signed-in user.)
-- Expected output: nothing. Any row printed = table missing RLS.
select c.relname
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by 1;
