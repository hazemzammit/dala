import { z } from 'zod';

/**
 * packages/validation/src/notifications.ts
 *
 * Phase 5 — Doc 03 §3.23 per-category push toggles + Doc 02 §2.9a digest
 * opt-in, migration 0025's profiles.notification_prefs jsonb column.
 * One schema for the whole preferences object, written as a unit from the
 * Notifications settings sub-screen (never a partial patch of one key at a
 * time — matches how the column itself is read/written).
 */

export const notificationPrefsSchema = z.object({
  dispatch: z.boolean(),
  advances: z.boolean(),
  materials: z.boolean(),
  safety: z.boolean(),
  digest_frequency: z.enum(['off', 'daily', 'weekly']),
});
export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;

/** Doc 02 §2.9a — sent once on notification-permission grant / app foreground,
 *  never re-sent speculatively. */
export const registerPushTokenSchema = z.object({
  expo_push_token: z.string().min(1),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;
