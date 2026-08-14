import type {
  SyncPullArgs,
  SyncPullResult,
  SyncDatabaseChangeSet,
  SyncTableChangeSet,
} from '@nozbe/watermelondb/sync';

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
 * DELETE HANDLING — real limitation, disclosed rather than silently
 * skipped: none of the 5 tables (dispatch_assignments, attendance_records,
 * advances, materials, site_logs) have a deleted_at/tombstone column, and a
 * repo-wide grep (migrations + apps/mobile + apps/admin) turned up zero
 * hard-delete statements against any of them anywhere in the codebase
 * today — so `deleted: []` below is accurate to current behavior, not a
 * shortcut. If a future migration ever adds a delete path to one of these
 * tables (soft or hard), this file needs a matching update to populate that
 * bucket, or a genuine server-side delete will silently fail to propagate
 * to already-synced devices, which would just leave a stale local copy
 * rather than erroring — worth a deliberate check before shipping whatever
 * adds that delete path, not something this phase can guard against
 * automatically.
 */

const SYNCED_TABLES = [
  'dispatch_assignments',
  'attendance_records',
  'advances',
  'materials',
  'site_logs',
] as const;

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

export async function pullChanges({ lastPulledAt }: SyncPullArgs): Promise<SyncPullResult> {
  const orgId = await getActiveOrgId();
  if (!orgId) {
    // No active org (signed out, or an account mid-setup with no org yet) —
    // nothing to pull. Returning an empty changeset for every table (rather
    // than throwing) lets `synchronize()` complete as a harmless no-op
    // instead of surfacing a scary error on, e.g., the very first app
    // launch before org creation finishes.
    const emptyChanges: Record<string, SyncTableChangeSet> = {};
    for (const table of SYNCED_TABLES) {
      emptyChanges[table] = { created: [], updated: [], deleted: [] };
    }
    return { changes: emptyChanges as SyncDatabaseChangeSet, timestamp: Date.now() };
  }

  const sinceIso = lastPulledAt ? new Date(lastPulledAt).toISOString() : null;
  const changes: Record<string, SyncTableChangeSet> = {};

  for (const table of SYNCED_TABLES) {
    let query = supabase.from(table).select('*').eq('org_id', orgId);
    if (sinceIso) {
      query = query.gt('updated_at', sinceIso);
    }
    const { data, error } = await query;

    if (error) {
      throw new Error(`[sync] pull failed for table "${table}": ${error.message}`);
    }

    changes[table] = {
      created: [],
      updated: (data ?? []).map(rowToDirtyRaw),
      deleted: [],
    };
  }

  return { changes: changes as SyncDatabaseChangeSet, timestamp: Date.now() };
}
