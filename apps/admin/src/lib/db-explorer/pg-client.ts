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

/** Thrown when the restricted read pool is required but not configured. */
export class ExplorerReadNotConfiguredError extends Error {
  constructor() {
    super(
      'DATABASE_URL_EXPLORER_RO is not set. The Database Explorer read path must connect as the ' +
        'least-privilege admin_explorer_login role (migration 0104) in production.',
    );
    this.name = 'ExplorerReadNotConfiguredError';
  }
}

let _readPool: Pool | null = null;
let _warnedFallback = false;

/**
 * Pool for the Database Explorer's READ path (/query, open to every admin
 * role). It connects as admin_explorer_login (migration 0104): read-only,
 * no access to the Vault / Supabase Auth / admin credential tables / secret
 * columns, no EXECUTE on the app's RPCs. That is the real boundary — the
 * classifier and the READ ONLY transaction in read-only-query.ts sit on top.
 *
 * Production REFUSES to fall back to the powerful DATABASE_URL: without
 * DATABASE_URL_EXPLORER_RO the read path is unavailable (503) rather than
 * silently running with superuser-equivalent rights. Outside production
 * (local Supabase CLI, CI) it falls back with a one-time warning so
 * `pnpm dev` works with zero extra setup.
 *
 * The write path (/execute, approvals) deliberately keeps using
 * getDbExplorerPool(): super_admin only, mandatory reason, second-admin
 * approval, full audit log.
 */
export function getDbExplorerReadPool(): Pool {
  if (_readPool) return _readPool;

  const restricted = process.env.DATABASE_URL_EXPLORER_RO;
  if (restricted) {
    _readPool = new Pool({ connectionString: restricted, max: 3, statement_timeout: 15_000 });
    return _readPool;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ExplorerReadNotConfiguredError();
  }
  if (!_warnedFallback) {
    _warnedFallback = true;
    console.warn(
      '[db-explorer] DATABASE_URL_EXPLORER_RO is not set — the read path is using DATABASE_URL ' +
        '(full privileges). Fine for local development; required in production.',
    );
  }
  return getPgPool();
}
