/**
 * apps/mobile/src/db/sync/localData.ts
 *
 * Ownership and lifecycle of the on-device WatermelonDB copy.
 *
 * Problem (audit): signing out only cleared the Supabase session. The local
 * SQLite kept the previous user's salary advances, attendance and site logs,
 * readable by whoever signed in next on a shared site phone — and their
 * still-unsynced changes would be pushed under the NEW user's session, get
 * rejected by RLS, and wedge the sync queue.
 *
 *  - ensureLocalDatabaseOwner(): records which user the local data belongs to
 *    and wipes it when a DIFFERENT user signs in.
 *  - wipeLocalDatabase(): explicit sign-out path (see lib/signOut.ts).
 *  - sync cursor org marker: which org the WatermelonDB `lastPulledAt` cursor
 *    was last committed for (pullChanges.ts honours the cursor only for that
 *    org).
 *
 * Stored in WatermelonDB's own localStorage so it is wiped together with the
 * data it describes.
 */
import * as Sentry from '@sentry/react-native';
import { InteractionManager } from 'react-native';

import { database } from '../index';

const OWNER_KEY = 'local_db_owner_user_id';
const CURSOR_ORG_KEY = 'sync_cursor_org_id';

export async function wipeLocalDatabase(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

/**
 * Wipe once the sign-out navigation has finished. WatermelonDB warns (and
 * drops subscribers) if it is reset while mounted screens still observe it.
 */
export function wipeLocalDatabaseAfterNavigation(): void {
  InteractionManager.runAfterInteractions(() => {
    wipeLocalDatabase().catch((error: unknown) => {
      console.error('[db] failed to wipe local database after sign-out', error);
      Sentry.captureException(error, { tags: { feature: 'offline_sync' } });
    });
  });
}

/**
 * Called at the start of every sync with the signed-in user's id.
 *  'unchanged' — same user as last time.
 *  'claimed'   — no recorded owner (first run of this code on an existing
 *                install, or a fresh install): data is kept and now owned by
 *                this user. Data left by an unknown earlier user on an
 *                existing install can't be identified retroactively.
 *  'wiped'     — a different user signed in: previous user's data removed.
 */
export async function ensureLocalDatabaseOwner(
  userId: string,
): Promise<'unchanged' | 'claimed' | 'wiped'> {
  const owner = await database.localStorage.get<string>(OWNER_KEY);
  if (owner === userId) return 'unchanged';
  if (owner) await wipeLocalDatabase(); // also clears localStorage (incl. cursor keys)
  await database.localStorage.set(OWNER_KEY, userId);
  return owner ? 'wiped' : 'claimed';
}

export async function getSyncCursorOrgId(): Promise<string | undefined> {
  return (await database.localStorage.get<string>(CURSOR_ORG_KEY)) ?? undefined;
}

export async function setSyncCursorOrgId(orgId: string): Promise<void> {
  await database.localStorage.set(CURSOR_ORG_KEY, orgId);
}
