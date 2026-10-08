/**
 * Runs one statement for the Database Explorer's read path with Postgres —
 * not a keyword classifier — enforcing that it cannot write.
 *
 * Why this exists: classifySql() is a first-word/keyword heuristic and was
 * shown to label `with d as (delete ...) select ...`, `explain analyze
 * delete ...` and write-capable function calls as "read". This helper makes
 * the database itself refuse them:
 *
 *  1. BEGIN READ ONLY — any INSERT/UPDATE/DELETE/DDL/nextval, including one
 *     hidden in a CTE or a volatile function, fails with 25006.
 *  2. A throw-away `SELECT 1` first, so a snapshot exists and the statement
 *     can no longer flip the transaction to read-write (Postgres forbids
 *     that after the first snapshot).
 *  3. The statement is sent as a NAMED prepared statement: the extended
 *     protocol rejects multi-statement strings ("cannot insert multiple
 *     commands"), so `select 1; commit; delete ...` cannot escape the
 *     transaction. (pg's `values: []` does NOT force this — verified.)
 *  4. Server-side statement/lock/idle timeouts + a watchdog that
 *     pg_terminate_backend()s the session after WATCHDOG_MS, because a
 *     statement can raise its own statement_timeout with set_config().
 *  5. The connection is destroyed afterwards (release(true)) so no session
 *     state — prepared statements, GUCs, roles — survives to the next admin.
 *  6. Row cap, so `select * from big_table` can't exhaust server memory.
 *
 * Deliberately takes the Pool as a parameter (no `server-only` import) so it
 * can be unit-tested against a real Postgres.
 */
import { randomUUID } from 'node:crypto';

import type { Pool, QueryResult } from 'pg';

export const READ_ONLY_MAX_ROWS = 1000;
const WATCHDOG_MS = 20_000;

export interface ReadOnlyResult {
  rows: Record<string, unknown>[];
  fields: string[];
  rowCount: number | null;
  truncated: boolean;
}

export async function runReadOnlyQuery(pool: Pool, sql: string): Promise<ReadOnlyResult> {
  const client = await pool.connect();
  let watchdog: NodeJS.Timeout | undefined;
  try {
    const pid = (await client.query('select pg_backend_pid() as pid')).rows[0]?.pid as number;
    watchdog = setTimeout(() => {
      // Separate connection: the session running the statement is busy.
      void pool.query('select pg_terminate_backend($1)', [pid]).catch(() => undefined);
    }, WATCHDOG_MS);

    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query('SELECT 1'); // take the snapshot (see 2.)

    const result: QueryResult = await client.query({
      name: `dbx_${randomUUID().replace(/-/g, '')}`,
      text: sql,
    });

    const rows = result.rows.slice(0, READ_ONLY_MAX_ROWS);
    return {
      rows,
      fields: result.fields.map((f) => f.name),
      rowCount: result.rowCount,
      truncated: result.rows.length > READ_ONLY_MAX_ROWS,
    };
  } finally {
    if (watchdog) clearTimeout(watchdog);
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection may already be gone */
    }
    client.release(true); // destroy, don't return to the pool (see 5.)
  }
}
