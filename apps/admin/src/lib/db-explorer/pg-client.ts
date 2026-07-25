/**
 * Direct Postgres connection for the Database Explorer (Doc 04 §4.3.5).
 *
 * supabase-js's REST interface can only query tables it already knows the
 * shape of and can't run genuinely arbitrary SQL (joins across tables not
 * exposed via PostgREST relationships, EXPLAIN, aggregate-only queries,
 * etc.) — a real SQL browser needs a real Postgres connection. `pg` talks
 * to the same database the service-role client does, just bypassing
 * PostgREST entirely. Still server-only, still never touches a client.
 */
import 'server-only';
import { Pool } from 'pg';

let _pool: Pool | null = null;

export function getPgPool(): Pool {
  if (_pool) return _pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'Missing DATABASE_URL. Set it in apps/admin/.env.local — local Supabase CLI default is ' +
        'postgresql://postgres:postgres@127.0.0.1:54322/postgres.',
    );
  }

  _pool = new Pool({
    connectionString,
    max: 3,
    // Database Explorer queries can be slow/exploratory by nature (an admin
    // debugging something) — a longer statement timeout than the app's own
    // normal query paths would use, but still bounded so a runaway query
    // can't hold a connection forever.
    statement_timeout: 30_000,
  });
  return _pool;
}

/** Kept as the original name — every existing Database Explorer route
 * already imports this; renaming would just churn unrelated files. Same
 * pool underneath (getPgPool is the general-purpose name used by
 * lib/crypto/totp-secret.ts, which has nothing to do with the Database
 * Explorer specifically). */
export const getDbExplorerPool = getPgPool;
