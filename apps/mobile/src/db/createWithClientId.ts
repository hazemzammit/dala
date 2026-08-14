import type { Collection, Model } from '@nozbe/watermelondb';
import * as Crypto from 'expo-crypto';

/**
 * apps/mobile/src/db/createWithClientId.ts
 *
 * Doc 01 §1.9/§1.11 offline-first sync — Phase 19. Every synced model's
 * own header documents "id is the same UUID as the Postgres row's id,
 * generated client-side" as the reason there's no separate server_id
 * column — this is the ONE place that convention is actually implemented,
 * shared across every screen that creates a synced record locally rather
 * than repeating the same explanation in each one.
 *
 * WatermelonDB auto-generates a random local id inside `.create()` BEFORE
 * the builder callback runs (confirmed from the installed package's
 * `RawRecord/index.js`: `sanitizedRaw` calls its own `randomId()` whenever
 * no `id` is present in the dirty raw it's given). There's no public
 * setter for `id` (`Model` only exposes a getter) — overwriting `_raw.id`
 * directly, before the record is ever persisted, is the only way to make
 * the local id the one this app's client-supplied-id convention needs.
 * `_raw` is publicly typed in the installed package (not `private`), so
 * this isn't reaching past a real access boundary — just past the missing
 * convenience setter.
 *
 * Still must be called from inside `database.write()`, same as a bare
 * `collection.create()` — this helper doesn't open its own writer.
 */
export function createWithClientId<T extends Model>(
  collection: Collection<T>,
  recordBuilder: (record: T) => void,
): Promise<T> {
  return collection.create((record) => {
    record._raw.id = Crypto.randomUUID();
    recordBuilder(record);
  });
}
