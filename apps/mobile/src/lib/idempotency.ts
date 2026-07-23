import * as Crypto from 'expo-crypto';

/**
 * apps/mobile/src/lib/idempotency.ts
 *
 * Doc 01 §1.11.2 — "the client generates a UUID the moment a money-moving
 * button is tapped." Nothing in the mobile app generated a UUID
 * client-side before Phase 2 (no uuid package, no expo-crypto dependency)
 * — createAdvanceSchema/markSalaryCyclePaidSchema already modeled the
 * field, but there was no source for the value itself. `expo-crypto`'s
 * `randomUUID()` (added to package.json alongside this file) is the
 * standard Expo SDK source for a cryptographically-random UUID; every
 * money-moving screen calls this once, synchronously, at tap-time — never
 * memoized across taps, since a fresh action needs a fresh key.
 */
export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}
