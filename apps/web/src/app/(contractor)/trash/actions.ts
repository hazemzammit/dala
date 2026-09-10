'use server';

import type { TrashItem } from '@dala/shared-types';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * apps/web/src/app/(contractor)/trash/actions.ts
 *
 * Gap-closure guide §1.1 — web equivalent of mobile's trash.tsx
 * `handleRestore()`. Same `rpcByType` lookup table, same four entity
 * types (project/worker/vehicle/site_log) — mobile's own comment
 * confirms this is the full current scope, not a "web is behind" list.
 * Every restore RPC (0013/0025/0072/0076) is `security definer` and does
 * its own org/author authorization check server-side (see e.g.
 * restore_site_log()'s org_role_of() check in 0072) — the client only
 * needs to pass the id, matching mobile exactly.
 */
const RPC_BY_TYPE: Record<TrashItem['entity_type'], { rpc: string; param: string }> = {
  project: { rpc: 'restore_project', param: 'p_project_id' },
  worker: { rpc: 'restore_worker', param: 'p_worker_id' },
  vehicle: { rpc: 'restore_vehicle', param: 'p_vehicle_id' },
  site_log: { rpc: 'restore_site_log', param: 'p_log_id' },
};

export async function restoreItem(
  entityType: TrashItem['entity_type'],
  id: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { rpc, param } = RPC_BY_TYPE[entityType];
  const { error } = await supabase.rpc(rpc, { [param]: id });

  if (error) {
    console.error('restoreItem error:', error);
    return { success: false, error: 'Impossible de restaurer cet élément.' };
  }

  revalidatePath('/trash');
  return { success: true };
}
