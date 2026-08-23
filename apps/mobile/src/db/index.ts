import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import * as Sentry from '@sentry/react-native';

import Advance from './models/Advance';
import AttendanceRecord from './models/AttendanceRecord';
import DispatchAssignment from './models/DispatchAssignment';
import DispatchAssignmentConflict from './models/DispatchAssignmentConflict';
import MaterialRequest from './models/MaterialRequest';
import SiteLog from './models/SiteLog';
import { schema } from './schema';

/**
 * apps/mobile/src/db/index.ts
 *
 * Doc 03 §3.3/§3.9 offline-first sync — Phase 17. The single WatermelonDB
 * `Database` instance for the whole app: the SQLite adapter bound to
 * `schema.ts`, with the 6 local model classes registered. Every screen
 * that touches local data imports `database` from here (see the 6
 * `models/*.ts` files' own headers for the per-table sync contract, and
 * `schema.ts`'s header for why schema version stays at 1).
 *
 * BUG FOUND AND FIXED HERE: this file had been entirely overwritten by
 * the Phase 1 (improvement-plan §5.2) sync-status change — its actual
 * content (the `runSync()` sync-runner logic, which belongs at
 * `db/sync/index.ts`, and imports `database` FROM here via `'../index'`)
 * had been written to this path instead of `db/sync/index.ts`, wiping out
 * the real Database/adapter/model-registration setup that used to live
 * here. That's exactly why every screen doing `import { database } from
 * '@/db'` failed to compile ("declares 'database' locally, but it is not
 * exported") and every WatermelonDB `record.orgId = ...` write inside
 * `db/sync/pullChanges.ts`/`pushChanges.ts`/every screen's `.create()`
 * callback failed too (`Model`'s base type has none of those fields
 * without the real model classes being the ones actually registered).
 * Fixed by moving the sync-runner content to `db/sync/index.ts` (where its
 * own header always said it belonged, and where `lib/syncStatus.ts`
 * already imports `SyncResult` from `@/db/sync`, not `@/db`) and
 * rebuilding this file from `schema.ts` + the 6 `models/*.ts` classes,
 * which were themselves untouched by the mistake and are the actual
 * source of truth for what this file needs to wire together.
 *
 * `jsi: true` — required by `@morrowdigital/watermelondb-expo-plugin`
 * being registered in `app.json`; that config plugin patches the native
 * side specifically for JSI-mode WatermelonDB, so the adapter must be
 * constructed to match (the async/bridge mode the plugin does NOT patch
 * for would silently fall back to a slower path, not fail loudly, so this
 * is deliberate rather than a default left in place). Per `schema.ts`'s
 * own header, no real device has instantiated a local SQLite file from
 * this schema yet, so this is still pending its first live-device
 * verification (Doc 10 §10.1) — same open item that section already
 * tracks, not a new one.
 *
 * `onSetUpError` reports to Sentry with the same
 * `tags: { feature: 'offline_sync' }` shape `db/sync/index.ts` uses for a
 * failed sync run — a failed local DB setup is the one failure mode more
 * fundamental than a sync failure (nothing above this layer can work at
 * all), so it's tagged under the same feature area rather than inventing
 * a new one.
 */
const adapter = new SQLiteAdapter({
  schema,
  jsi: true,
  onSetUpError: (error) => {
    // eslint-disable-next-line no-console
    console.error('[db] local database failed to set up', error);
    Sentry.captureException(error, { tags: { feature: 'offline_sync' } });
  },
});

export const database = new Database({
  adapter,
  modelClasses: [
    Advance,
    AttendanceRecord,
    DispatchAssignment,
    DispatchAssignmentConflict,
    MaterialRequest,
    SiteLog,
  ],
});
