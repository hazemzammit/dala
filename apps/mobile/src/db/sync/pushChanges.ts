import { isValidTimeString } from '@dala/validation';
import type { SyncPushArgs, SyncTableChangeSet } from '@nozbe/watermelondb/sync';

import type { PendingDispatchConflict } from './conflictResolver';

import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/db/sync/pushChanges.ts
 *
 * PHASE 19 — `advances` and `site_logs` now push through their real
 * idempotency-keyed RPCs (`create_advance`/`request_advance`,
 * `submit_site_log_entry`) instead of a raw `.upsert()`. Phase 18's
 * version of this file used a generic upsert for all 4 append-only tables
 * uniformly and flagged the RPC bypass as a known gap for this phase to
 * fix — this is that fix.
 *
 * Doing this surfaced a real, separate bug: none of the 3 RPCs
 * (`create_advance`/`request_advance`/`submit_site_log_entry`) accepted a
 * caller-supplied `id` — they always generated a fresh one server-side via
 * `gen_random_uuid()`. That breaks the local-id-equals-server-id invariant
 * every model in this schema documents as the reason there's no separate
 * server_id column. Fixed in migration 0047 (adds an optional
 * `p_id uuid default null` to all three, backward-compatible with every
 * existing caller) — verified against real Postgres this phase, including
 * a client-supplied-id round trip and confirming idempotency-key replay is
 * unaffected by which p_id a retry happens to send.
 *
 * `attendance_records`/`materials` are unchanged — genuinely plain
 * RLS-gated table writes in every current screen (confirmed by reading
 * `pointage.tsx`/`home.tsx`/`material-request.tsx`/`materials.tsx`
 * directly), no RPC/idempotency layer to route around.
 *
 * `updated_at` is stripped from every payload — 0045's `set_updated_at()`
 * trigger (BEFORE UPDATE only) or the column's own `default now()` (on
 * INSERT) already own that value.
 *
 * PHASE 21 — closes the two `created_at`/`caption` gaps this file's Phase
 * 19 header used to disclose as unfixed. Migration 0048 adds an optional
 * `p_created_at timestamptz default null` to all three RPCs (falling back
 * to `now()` when omitted, same backward-compatible append-only-overload
 * pattern as `p_id` in 0047) and an optional `p_caption text default null`
 * to `submit_site_log_entry` specifically. `created_at` is now sent for
 * EVERY table this file pushes — `attendance_records`/`materials` via the
 * plain upsert path (unchanged from Phase 19), `advances`/`site_logs` via
 * `p_created_at` on their respective RPCs — so a genuinely offline-created
 * row of any of the 5 synced tables now preserves its true field-creation
 * moment, not its server-arrival time. `caption` is read from
 * `dirtyRaw.caption` and passed as `p_caption` on every `site_logs` push;
 * as of this phase `update-chantier.tsx` (this table's only write path)
 * still never sets it to anything but `null` (confirmed by reading that
 * file directly — no caption UI field exists there, see that file's own
 * header for why that's a separate, undecided product question, not
 * silently bundled into this fix), so this plumbing fix has no visible
 * effect yet — it just means a caption WOULD reach the server correctly
 * the moment any write path starts setting one, instead of being silently
 * dropped the way it was through Phase 20.
 */

const DISPATCH_ASSIGNMENTS_TABLE = 'dispatch_assignments';
const GENERIC_UPSERT_TABLES = ['attendance_records', 'materials'] as const;

function toIsoOrNull(epochMs: unknown): string | null {
  return typeof epochMs === 'number' ? new Date(epochMs).toISOString() : null;
}

/** Same conversion as `toIsoOrNull`, named separately for the RPC call
 * sites below (`p_created_at`) so the two purposes — a plain upsert column
 * vs. an RPC parameter — read distinctly at each call site, even though
 * the underlying epoch-ms -> ISO conversion is identical. */
function dirtyRawCreatedAtIso(raw: Record<string, unknown>): string | null {
  return toIsoOrNull(raw.created_at);
}

function toUpsertRow(dirtyRaw: Record<string, unknown>, includeCreatedAt: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _status, _changed, updated_at, created_at, ...rest } = dirtyRaw;
  return includeCreatedAt ? { ...rest, created_at: toIsoOrNull(created_at) } : rest;
}

/**
 * PHASE 22 — `departure_time`/`actual_departure_time` map to plain
 * Postgres `time` columns (migration 0006) and used to be validated only
 * as `z.string()` client-side (see @dala/validation's dispatch.ts header),
 * so a bare `"7"` typed into dispatch.tsx before that schema was tightened
 * could already be sitting in a device's local WatermelonDB, marked dirty,
 * forever. `pushDispatchAssignments` batches every `created` row into a
 * SINGLE `.upsert()` call — one row with an invalid time value fails the
 * whole batch, which throws, which means WatermelonDB never marks ANY row
 * in that push as synced, so the exact same batch (bad row included)
 * retries on the very next sync forever. Tightening the zod schema (done
 * separately) stops new bad values from being created, but can't reach a
 * value that was already written to local storage before that fix shipped
 * — this is the actual last line of defense, at the sync boundary itself,
 * and it's the only place that can self-heal an already-stuck device
 * without asking anyone to manually find and re-edit the offending
 * assignment. Invalid values are dropped (set to null) rather than
 * guessed-at or blocked — losing a bad departure-time value is harmless;
 * blocking the entire dispatch board's sync indefinitely is not.
 */
function sanitizeDispatchTimeFields<T extends Record<string, unknown>>(row: T): T {
  const sanitized = { ...row };
  for (const field of ['departure_time', 'actual_departure_time'] as const) {
    const value = sanitized[field];
    if (typeof value === 'string' && value !== '' && !isValidTimeString(value)) {
      console.warn(
        `[sync] dropping invalid ${field} value ${JSON.stringify(value)} on dispatch_assignments — expected HH:MM(:SS).`,
      );
      (sanitized as Record<string, unknown>)[field] = null;
    }
  }
  return sanitized;
}

/** Every locally-created record should already have an idempotency_key set
 * by the screen that created it (the whole point of the column). This is a
 * defensive fallback only, not the primary path — falling back to the
 * record's own `id` still gives a stable, retry-consistent key rather than
 * silently skipping idempotency protection. */
function resolveIdempotencyKey(raw: Record<string, unknown>): string {
  const key = raw.idempotency_key;
  return typeof key === 'string' && key !== '' ? key : (raw.id as string);
}

async function pushGenericUpsertTable(
  table: string,
  tableChanges: SyncTableChangeSet,
): Promise<void> {
  const upsertRows = [
    ...tableChanges.created.map((raw: Record<string, unknown>) => toUpsertRow(raw, true)),
    ...tableChanges.updated.map((raw: Record<string, unknown>) => toUpsertRow(raw, false)),
  ];

  if (upsertRows.length > 0) {
    const { error } = await supabase.from(table).upsert(upsertRows);
    if (error) {
      throw new Error(`[sync] push upsert failed for table "${table}": ${error.message}`);
    }
  }

  if (tableChanges.deleted.length > 0) {
    // No current write path in this app hard-deletes rows in either of
    // these 2 tables (confirmed by repo-wide grep — see pullChanges.ts's
    // matching note) — this branch exists for protocol completeness.
    const { error } = await supabase.from(table).delete().in('id', tableChanges.deleted);
    if (error) {
      throw new Error(`[sync] push delete failed for table "${table}": ${error.message}`);
    }
  }
}

async function pushAdvances(tableChanges: SyncTableChangeSet): Promise<void> {
  for (const raw of tableChanges.created as Record<string, unknown>[]) {
    const idempotencyKey = resolveIdempotencyKey(raw);

    // Which RPC created this row, inferred from the fields the two RPCs
    // set differently — not a separate local-only marker column.
    // request_advance() always inserts status='pending' with
    // requested_by set; create_advance() always inserts status='approved'
    // with approved_by set. Phase 19's screens are responsible for
    // setting these fields to match at local-creation time (advance-
    // request.tsx -> pending/requested_by; advances.tsx's quick-advance
    // -> approved/approved_by).
    const isWorkerRequest = raw.status === 'pending';

    const { error } = isWorkerRequest
      ? await supabase.rpc('request_advance', {
          p_amount: raw.amount,
          p_reason: raw.reason,
          p_idempotency_key: idempotencyKey,
          p_id: raw.id,
          p_created_at: dirtyRawCreatedAtIso(raw),
        })
      : await supabase.rpc('create_advance', {
          p_org_id: raw.org_id,
          p_worker_id: raw.worker_id,
          p_amount: raw.amount,
          p_reason: raw.reason,
          p_idempotency_key: idempotencyKey,
          p_id: raw.id,
          p_created_at: dirtyRawCreatedAtIso(raw),
        });

    if (error) {
      throw new Error(`[sync] push failed for "advances" id=${raw.id}: ${error.message}`);
    }
  }

  if (tableChanges.updated.length > 0) {
    // Append-only per Doc 01 §1.9 — no screen should ever issue a local
    // UPDATE to an already-created advances row (approval always goes
    // through approve_advance() directly, online-only, never through this
    // sync path — see Phase 19's kickoff notes). If one shows up here
    // anyway, it's a bug in whatever screen produced it, not something
    // this file can safely correct on its own — surfaced loudly rather
    // than silently dropped or silently upserted around the RPC layer.
    // eslint-disable-next-line no-console
    console.error(
      `[sync] unexpected local UPDATE to "advances" (${tableChanges.updated.length} row(s)) — this table is append-only; the update was NOT pushed. Check whichever screen produced it.`,
    );
  }
}

async function pushSiteLogs(tableChanges: SyncTableChangeSet): Promise<void> {
  for (const raw of tableChanges.created as Record<string, unknown>[]) {
    const idempotencyKey = resolveIdempotencyKey(raw);

    const { error } = await supabase.rpc('submit_site_log_entry', {
      p_project_id: raw.project_id,
      p_photo_url: raw.photo_url,
      p_voice_note_url: raw.voice_note_url,
      p_note_text: raw.note_text,
      p_thumbnail_url: raw.thumbnail_url,
      p_location_lat: raw.location_lat,
      p_location_lng: raw.location_lng,
      p_idempotency_key: idempotencyKey,
      p_id: raw.id,
      p_created_at: dirtyRawCreatedAtIso(raw),
      p_caption: raw.caption ?? null,
    });

    if (error) {
      throw new Error(`[sync] push failed for "site_logs" id=${raw.id}: ${error.message}`);
    }
    // `caption` now reaches the server (migration 0048's `p_caption`) — but
    // `update-chantier.tsx`, this table's only write path, still never sets
    // it to anything but `null` (confirmed by reading that file directly),
    // so this has no visible effect yet. See this file's own header for why
    // adding a caption UI field is a separate, undecided product question.
  }

  if (tableChanges.updated.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[sync] unexpected local UPDATE to "site_logs" (${tableChanges.updated.length} row(s)) — this table is append-only; the update was NOT pushed.`,
    );
  }
}

async function pushDispatchAssignments(
  tableChanges: SyncTableChangeSet,
  pendingConflicts: PendingDispatchConflict[],
): Promise<void> {
  if (tableChanges.created.length > 0) {
    const upsertRows = tableChanges.created.map((raw: Record<string, unknown>) =>
      sanitizeDispatchTimeFields(toUpsertRow(raw, true)),
    );
    const { error } = await supabase.from(DISPATCH_ASSIGNMENTS_TABLE).upsert(upsertRows);
    if (error) {
      throw new Error(
        `[sync] push insert failed for "${DISPATCH_ASSIGNMENTS_TABLE}": ${error.message}`,
      );
    }
  }

  for (const raw of tableChanges.updated as Record<string, unknown>[]) {
    const { id, version, ...rest } = sanitizeDispatchTimeFields(
      toUpsertRow(raw, false) as { id: string; version: number } & Record<string, unknown>,
    );

    if (typeof version !== 'number') {
      pendingConflicts.push({
        dispatchAssignmentId: id,
        localSnapshot: JSON.stringify(rest),
        serverVersionAtConflict: -1,
      });
      continue;
    }

    const { data, error } = await supabase
      .from(DISPATCH_ASSIGNMENTS_TABLE)
      .update({ ...rest, version: version + 1 })
      .eq('id', id)
      .eq('version', version)
      .select('id');

    if (error) {
      throw new Error(
        `[sync] push update failed for "${DISPATCH_ASSIGNMENTS_TABLE}" id=${id}: ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      const { data: currentRow } = await supabase
        .from(DISPATCH_ASSIGNMENTS_TABLE)
        .select('version')
        .eq('id', id)
        .maybeSingle();

      pendingConflicts.push({
        dispatchAssignmentId: id,
        localSnapshot: JSON.stringify(rest),
        serverVersionAtConflict:
          typeof currentRow?.version === 'number' ? currentRow.version : version,
      });
    }
  }

  if (tableChanges.deleted.length > 0) {
    const { error } = await supabase
      .from(DISPATCH_ASSIGNMENTS_TABLE)
      .delete()
      .in('id', tableChanges.deleted);
    if (error) {
      throw new Error(
        `[sync] push delete failed for "${DISPATCH_ASSIGNMENTS_TABLE}": ${error.message}`,
      );
    }
  }
}

export function createPushChanges(
  pendingConflicts: PendingDispatchConflict[],
): (args: SyncPushArgs) => Promise<void> {
  return async function pushChanges({ changes }: SyncPushArgs): Promise<void> {
    const typedChanges = changes as unknown as Record<string, SyncTableChangeSet>;

    const dispatchChanges = typedChanges[DISPATCH_ASSIGNMENTS_TABLE];
    if (dispatchChanges) {
      await pushDispatchAssignments(dispatchChanges, pendingConflicts);
    }

    const advancesChanges = typedChanges['advances'];
    if (advancesChanges) {
      await pushAdvances(advancesChanges);
    }

    const siteLogsChanges = typedChanges['site_logs'];
    if (siteLogsChanges) {
      await pushSiteLogs(siteLogsChanges);
    }

    for (const table of GENERIC_UPSERT_TABLES) {
      const tableChanges = typedChanges[table];
      if (tableChanges) {
        await pushGenericUpsertTable(table, tableChanges);
      }
    }
  };
}
