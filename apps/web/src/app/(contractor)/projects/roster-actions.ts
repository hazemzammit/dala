'use server';

import { addProjectWorkerSchema, removeProjectWorkerSchema } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { checkProjectIsWritable } from '@/lib/projectStatus';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * apps/web/src/app/(contractor)/projects/roster-actions.ts
 *
 * Gap-closure guide §1.7 — web equivalent of mobile's project-roster.tsx
 * write paths. Same insert/soft-delete shape:
 *   - add: plain insert, org_id deliberately omitted — the
 *     `set_project_worker_org_id` before-insert trigger (migration 0034)
 *     derives it from `workers.org_id` server-side, so a client-supplied
 *     org_id here would just reopen the spoofing vector that trigger
 *     closes. Same reasoning mobile's own comment gives.
 *   - remove: soft-delete only (`removed_at`/`removed_by`), never a hard
 *     delete — preserves history for the same reactivation/audit reasons
 *     migration 0034's header states.
 *
 * Archived-project guard: reused from `apps/web/src/lib/projectStatus.ts`
 * (the shared helper this integration pass's other write routes already
 * use) rather than reinventing it, per the guide's explicit instruction —
 * this is the one new-route case that file's own header comment
 * anticipated ("project-roster's project_workers insert might need it").
 * Mobile's own version of this same guard is client-side only; this is
 * real server-side enforcement, consistent with every other route this
 * pass built.
 */
export async function addWorkerToRoster(input: {
  projectId: string;
  workerId: string;
}): Promise<ActionResult> {
  const parsed = addProjectWorkerSchema.safeParse({
    project_id: input.projectId,
    worker_id: input.workerId,
  });
  if (!parsed.success) return { success: false, error: 'Requête invalide.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) return { success: false, error: 'Organisation introuvable.' };

  const writableError = await checkProjectIsWritable(
    supabase,
    parsed.data.project_id,
    profile.active_org_id,
  );
  if (writableError) return { success: false, error: writableError };

  const { error } = await supabase.from('project_workers').insert({
    project_id: parsed.data.project_id,
    worker_id: parsed.data.worker_id,
    added_by: user.id,
  });
  if (error) return { success: false, error: "Impossible d'ajouter ce travailleur au chantier." };

  revalidatePath('/projects');
  return { success: true };
}

export async function removeWorkerFromRoster(input: {
  id: string;
  projectId: string;
}): Promise<ActionResult> {
  const parsed = removeProjectWorkerSchema.safeParse({ id: input.id });
  if (!parsed.success) return { success: false, error: 'Requête invalide.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) return { success: false, error: 'Organisation introuvable.' };

  const writableError = await checkProjectIsWritable(
    supabase,
    input.projectId,
    profile.active_org_id,
  );
  if (writableError) return { success: false, error: writableError };

  const { error } = await supabase
    .from('project_workers')
    .update({ removed_at: new Date().toISOString(), removed_by: user.id })
    .eq('id', parsed.data.id);
  if (error) return { success: false, error: 'Impossible de retirer ce travailleur.' };

  revalidatePath('/projects');
  return { success: true };
}
