import { hasUnsyncedChanges } from '@nozbe/watermelondb/sync';

import { supabase } from './supabase';

import { database } from '@/db';
import { runSync } from '@/db/sync';
import { wipeLocalDatabaseAfterNavigation } from '@/db/sync/localData';

const FLUSH_TIMEOUT_MS = 8_000;

/**
 * Sign out AND remove the on-device copy of the organisation's data.
 *
 * 1. While the session still exists, try to push pending offline work
 *    (bounded by FLUSH_TIMEOUT_MS so a dead network can't hang the button).
 * 2. Sign out, then navigate away (screens must stop observing the database
 *    before it can be reset).
 * 3. Wipe local data — but ONLY if nothing is left unsynced. If the flush
 *    failed (offline) we keep the data rather than silently destroy field
 *    work: the same user signing back in syncs it; a different user signing
 *    in triggers ensureLocalDatabaseOwner()'s wipe instead.
 *
 * `sessionAlreadyInvalid` (account deleted): skip the flush and always wipe.
 */
export async function signOutAndWipe(
  navigateToLogin: () => void,
  options: { sessionAlreadyInvalid?: boolean } = {},
): Promise<void> {
  let safeToWipe = true;

  if (!options.sessionAlreadyInvalid) {
    try {
      await Promise.race([runSync(), new Promise<void>((r) => setTimeout(r, FLUSH_TIMEOUT_MS))]);
      safeToWipe = !(await hasUnsyncedChanges({ database }));
    } catch {
      safeToWipe = false;
    }
  }

  await supabase.auth.signOut();
  navigateToLogin();
  if (safeToWipe) wipeLocalDatabaseAfterNavigation();
}
