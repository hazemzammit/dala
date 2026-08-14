import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

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
 * Phase 17 — Database singleton, built but NOT wired into the app yet.
 * Nothing in this file is imported from `_layout.tsx` or any screen as of
 * this phase; it exists so the schema/models above are a real, importable,
 * instantiable module (and so Phase 18's sync adapter has something
 * concrete to call `database.get('...')` against), not so offline writes
 * start happening yet. Wiring this into app startup and actually routing
 * writes through it is Phase 18/19 scope.
 *
 * `jsi: true` — the modern synchronous WatermelonDB SQLite mode
 * (`SQLiteAdapterOptions.jsi`, confirmed from the installed
 * @nozbe/watermelondb@0.27.1 source, not assumed from memory). This
 * requires the native JSI module to actually be linked into the iOS/Android
 * build. UNVERIFIED IN THIS PHASE: there is no device, simulator, or Expo
 * dev-client build available in this sandboxed environment, and the repo's
 * app.json was not checked yet for whether a config plugin is needed to
 * link WatermelonDB's native code into an Expo build. That native-linking
 * step is real, unverified risk for Phase 18 — flagging now rather than
 * silently assuming `jsi: true` will just work on first native build.
 */
export const database = new Database({
  adapter: new SQLiteAdapter({
    schema,
    dbName: 'dala',
    jsi: true,
    onSetUpError: (error) => {
      // Phase 18/19: report to Sentry (already a dependency,
      // @sentry/react-native) once this is actually wired into app
      // startup. Left as a bare comment, not a real Sentry.captureException
      // call, so this file has no side effects just by being imported.
      // eslint-disable-next-line no-console
      console.error('[watermelondb] setup error', error);
    },
  }),
  modelClasses: [
    DispatchAssignment,
    AttendanceRecord,
    Advance,
    MaterialRequest,
    SiteLog,
    DispatchAssignmentConflict,
  ],
});
