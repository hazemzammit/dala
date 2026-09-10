'use server';

import { markAttendanceSchema, type MarkAttendanceInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { checkProjectIsWritable } from '@/lib/projectStatus';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

async function resolveActiveOrg() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Session expirée, reconnectez-vous.' as const };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.active_org_id) {
    return { error: 'Aucune organisation active.' as const };
  }

  // §2.8 — same real-write-blocking gate as every other operational action.
  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { error: emailError };

  return { supabase, userId: user.id, orgId: profile.active_org_id };
}

/**
 * `attendance_records` is append-only by design (migration 0036's header,
 * citing 0007): no unique constraint on (worker_id, record_date), and
 * deliberately no update/delete RLS policy at all — a manual entry must
 * never be silently destroyed, which is also what the Phase 6
 * attendance-history/correction screen (0072) depends on being true. The
 * collaborator's original version of this action deleted the existing
 * 'manual_pointage' row before inserting a new one, which both violates
 * that invariant and would likely fail outright against RLS (no delete
 * policy exists to satisfy). Fixed to always INSERT a new row, exactly
 * like mobile's pointage.tsx handleSave — the `attendance_effective` view
 * (0036) is what resolves "which row wins" on the read side, not this
 * write path.
 */
export async function saveManualAttendance(input: MarkAttendanceInput): Promise<ActionResult> {
  const parsed = markAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const context = await resolveActiveOrg();
  if ('error' in context) return { success: false, error: context.error ?? 'Erreur inconnue.' };

  const { supabase, userId, orgId } = context;
  const workerId = parsed.data.worker_id!;
  const recordDate = parsed.data.record_date!;
  const status = parsed.data.status!;

  if (parsed.data.project_id) {
    const projectError = await checkProjectIsWritable(supabase, parsed.data.project_id, orgId);
    if (projectError) return { success: false, error: projectError };
  }

  const { error } = await supabase.from('attendance_records').insert({
    org_id: orgId,
    worker_id: workerId,
    project_id: parsed.data.project_id ?? null,
    record_date: recordDate,
    status,
    source: 'manual_pointage',
    recorded_by: userId,
    absence_reason: status === 'absent' ? (parsed.data.absence_reason ?? null) : null,
  });

  if (error) {
    return { success: false, error: 'Impossible d’enregistrer le pointage manuel.' };
  }

  revalidatePath('/pointage');
  return { success: true };
}
