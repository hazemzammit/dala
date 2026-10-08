import type {
  SyncPullArgs,
  SyncPullResult,
  SyncDatabaseChangeSet,
  SyncTableChangeSet,
} from '@nozbe/watermelondb/sync';

import { getSyncCursorOrgId } from './localData';

import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/db/sync/pullChanges.ts
 *
 * Doc 03 §3.3/§3.9 offline sync — Phase 18. Talks directly to Supabase
 * via the same `supabase-js` client every screen already uses (RLS-scoped,
 * anon key) — not a dedicated sync REST endpoint, since nothing in this
 * codebase has one and inventing a custom Edge Function protocol here would
 * be a second way of doing the same thing every other screen already does
 * (direct `.from(table).select()` calls, e.g. advances.tsx).
 *
 * Scoped to the ACTIVE org only (`getActiveOrgId()`), matching the existing
 * `.eq('org_id', org)` convention every current screen already follows
 * (confirmed by reading advances.tsx/vehicles.tsx/portfolio.tsx before
 * writing this) — not "every org this user belongs to." If the org switcher
 * is used, a fresh sync() call needs triggering for the new org; that's a
 * one-line addition at the org-switch call site, not built here — this file
 * only owns the pull itself.
 *
 * TABLE-CLASSIFICATION NOTE: this file puts every changed row into
 * WatermelonDB's `updated` bucket, never `created`, regardless of whether
 * the row is actually new to this device. Confirmed by reading WatermelonDB
 * 0.27.1's own source (src/sync/impl/applyRemote.js): the create-vs-update
 * decision at apply time is made by checking `recordsMap.has(raw.id)`
 * (does a local record with this id already exist), not by which bucket
 * the raw came in on — `created`/`updated` are informational buckets for
 * the caller, not instructions the library blindly follows. Splitting rows
 * into two buckets here would need a second query (e.g.
 * `created_at > sinceIso` vs `updated_at > sinceIso`) for no behavioral
 * difference, so it's skipped.
 *
 * `dispatch_assignments.version` needs no special handling here — it's a
 * plain integer column, passed through by the generic spread below like
 * any other field. It's `pushChanges.ts` and `conflictResolver.ts` that
 * give it meaning (Doc 01 §1.9 optimistic concurrency); this file's job is
 * just to bring the current server value down accurately.
 *
 * PHASE 18 REDO — this file previously also converted a server-side
 * `field_versions` jsonb map (ISO strings) into a local epoch-ms JSON
 * string. That column and the field-level-merge design it supported were
 * built against a stale docx snapshot, not this repo's own authoritative
 * `docs/spec/` — removed along with migration 0046's rewrite. See
 * schema.ts's header for the full correction.
 *
 * DELETE HANDLING (migration 0097) — this file previously hard-coded
 * `deleted: []`, on the premise that none of the synced tables is ever
 * hard-deleted. That premise was false (owners/managers can delete
 * dispatch_assignments, materials and advances; the web app deletes
 * materials), so a deleted row stayed on every already-synced phone forever.
 * A trigger now writes `sync_tombstones` rows for every hard delete of a
 * synced table, and this file pulls the tombstones newer than the cursor into
 * the `deleted` bucket. A device that stays offline longer than the tombstone
 * retention (>= 180 days, see 0097) must be re-installed.
 *
 * CURSOR (audit fixes) — three real defects lived here:
 *  1. `timestamp: Date.now()` was the DEVICE clock. A phone whose clock runs
 *     ahead stored a cursor in the future and skipped every server change in
 *     the gap, permanently. The cursor is now built from the SERVER clock
 *     (`get_server_time()`), read BEFORE the queries, minus PULL_OVERLAP_MS so
 *     a transaction that started before the cursor but committed after our
 *     read is fetched next time. Re-pulling overlap rows is harmless: they are
 *     applied idempotently.
 *  2. Queries were unpaginated, so PostgREST's max_rows (1000 on Supabase)
 *     silently truncated the result — and the cursor still advanced, so the
 *     remainder was never fetched. Each table is now read with KEYSET
 *     pagination on (updated_at, id), which stays correct while rows change
 *     mid-pull (offset paging would skip rows).
 *  3. WatermelonDB's lastPulledAt is global, not per org. After an org switch
 *     the new org's older rows were never pulled. The cursor is now only
 *     honoured if it was last committed for THIS org (see db/sync/index.ts,
 *     which records the org after a fully successful sync); otherwise the
 *     pull is a full pull. This also transparently migrates devices that
 *     hold an old device-clock cursor.
 */

const SYNCED_TABLES = [
  'dispatch_assignments',
  'attendance_records',
  'advances',
  'materials',
  'site_logs',
] as const;

/** Well under PostgREST's max_rows (1000) so a full page is never truncated. */
export const PULL_PAGE_SIZE = 500;
/** Hard stop against a pagination bug looping forever (500 * 400 = 200k rows). */
const MAX_PAGES = 400;
/** See CURSOR note 1. Covers transactions that commit up to this late. */
export const PULL_OVERLAP_MS = 30_000;

function toEpochMs(iso: string): number {
  return new Date(iso).getTime();
}

function rowToDirtyRaw(row: Record<string, unknown>): Record<string, unknown> {
  const { created_at, updated_at, ...rest } = row;
  return {
    ...rest,
    created_at: typeof created_at === 'string' ? toEpochMs(created_at) : null,
    updated_at: typeof updated_at === 'string' ? toEpochMs(updated_at) : null,
  };
}

async function fetchServerNowMs(): Promise<number> {
  const { data, error } = await supabase.rpc('get_server_time');
  if (error || typeof data !== 'string') {
    throw new Error(`[sync] could not read server time: ${error?.message ?? 'unexpected payload'}`);
  }
  const ms = Date.parse(data);
  if (Number.isNaN(ms)) throw new Error(`[sync] unparseable server time: ${String(data)}`);
  return ms;
}

/**
 * Keyset-paginated read of every row of `table` for `orgId` changed since
 * `sinceIso`, ordered by (updated_at, id). The raw `updated_at` STRING from the
 * previous page is fed back into the filter (not a JS Date), so microsecond
 * precision is preserved and ties are broken by id.
 */
async function fetchChangedRows(
  table: string,
  orgId: string,
  sinceIso: string | null,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let last: { updated_at: string; id: string } | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabase.from(table).select('*').eq('org_id', orgId);
    if (sinceIso) query = query.gt('updated_at', sinceIso);
    if (last) {
      query = query.or(
        `updated_at.gt."${last.updated_at}",and(updated_at.eq."${last.updated_at}",id.gt."${last.id}")`,
      );
    }
    const { data, error } = await query
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PULL_PAGE_SIZE);

    if (error) {
      throw new Error(`[sync] pull failed for table "${table}": ${error.message}`);
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < PULL_PAGE_SIZE) return rows;

    const tail = batch[batch.length - 1]!;
    const next = { updated_at: String(tail.updated_at), id: String(tail.id) };
    if (last && next.updated_at === last.updated_at && next.id === last.id) {
      throw new Error(`[sync] pagination made no progress on table "${table}"`);
    }
    last = next;
  }
  throw new Error(`[sync] pull of "${table}" exceeded ${MAX_PAGES} pages`);
}

/** Ids hard-deleted on the server since the cursor, grouped by table (0097). */
async function fetchDeletedIds(orgId: string, sinceIso: string): Promise<Record<string, string[]>> {
  const byTable: Record<string, string[]> = {};
  let lastId = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('sync_tombstones')
      .select('id, table_name, record_id')
      .eq('org_id', orgId)
      .gt('deleted_at', sinceIso)
      .gt('id', lastId)
      .order('id', { ascending: true })
      .limit(PULL_PAGE_SIZE);

    if (error) {
      throw new Error(`[sync] pull failed for sync_tombstones: ${error.message}`);
    }
    const batch = (data ?? []) as { id: number; table_name: string; record_id: string }[];
    for (const t of batch) (byTable[t.table_name] ??= []).push(t.record_id);
    if (batch.length < PULL_PAGE_SIZE) return byTable;
    lastId = batch[batch.length - 1]!.id;
  }
  throw new Error(`[sync] pull of sync_tombstones exceeded ${MAX_PAGES} pages`);
}

export async function pullChanges({ lastPulledAt }: SyncPullArgs): Promise<SyncPullResult> {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    // No active org (signed out, or an account mid-setup with no org yet) —
    // nothing to pull. Keep the cursor where it was (NOT Date.now()): advancing
    // it here would make the first real pull, once an org exists, skip every
    // row older than "now".
    const emptyChanges: Record<string, SyncTableChangeSet> = {};
    for (const table of SYNCED_TABLES) {
      emptyChanges[table] = { created: [], updated: [], deleted: [] };
    }
    return { changes: emptyChanges as SyncDatabaseChangeSet, timestamp: lastPulledAt ?? 0 };
  }

  // Server clock, read BEFORE any query (CURSOR note 1).
  const serverNowMs = await fetchServerNowMs();

  // CURSOR note 3: only trust the cursor if it was committed for this org.
  const cursorOrgId = await getSyncCursorOrgId();
  const effectiveLastPulledAt = cursorOrgId === orgId ? lastPulledAt : null;
  const sinceIso = effectiveLastPulledAt ? new Date(effectiveLastPulledAt).toISOString() : null;

  const changes: Record<string, SyncTableChangeSet> = {};
  for (const table of SYNCED_TABLES) {
    const rows = await fetchChangedRows(table, orgId, sinceIso);
    changes[table] = { created: [], updated: rows.map(rowToDirtyRaw), deleted: [] };
  }

  // A full pull has nothing local to delete that it wouldn't also not receive.
  if (sinceIso) {
    const deletedByTable = await fetchDeletedIds(orgId, sinceIso);
    for (const table of SYNCED_TABLES) {
      const ids = deletedByTable[table];
      if (ids && changes[table]) changes[table].deleted = ids;
    }
  }

  return {
    changes: changes as SyncDatabaseChangeSet,
    timestamp: serverNowMs - PULL_OVERLAP_MS,
  };
}
