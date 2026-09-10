'use server';

import { notificationPrefsSchema, type NotificationPrefsInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * apps/web/src/app/(contractor)/settings/notifications/actions.ts
 *
 * Same direct `profiles.notification_prefs` update mobile does — RLS is
 * `profiles_update_own` (id = auth.uid()), no role distinction, same as
 * every other field on this row.
 */
export async function updateNotificationPrefs(
  input: NotificationPrefsInput,
): Promise<ActionResult> {
  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Préférences invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { error } = await supabase
    .from('profiles')
    .update({ notification_prefs: parsed.data })
    .eq('id', user.id);

  if (error) return { success: false, error: 'Impossible de mettre à jour vos préférences.' };

  revalidatePath('/settings/notifications');
  return { success: true };
}
