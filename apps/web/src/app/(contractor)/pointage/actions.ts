'use server';

import { markAttendanceSchema, type MarkAttendanceInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

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

  return { supabase, userId: user.id, orgId: profile.active_org_id };
}

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

  const { error: deleteError } = await supabase
    .from('attendance_records')
    .delete()
    .eq('org_id', orgId)
    .eq('worker_id', workerId)
    .eq('record_date', recordDate)
    .eq('source', 'manual_pointage');

  if (deleteError) {
    return { success: false, error: 'Impossible de remplacer le pointage manuel existant.' };
  }

  const { error } = await supabase.from('attendance_records').insert({
    org_id: orgId,
    worker_id: workerId,
    project_id: parsed.data.project_id ?? null,
    record_date: recordDate,
    status,
    source: 'manual_pointage',
    recorded_by: userId,
  });

  if (error) {
    return { success: false, error: 'Impossible d’enregistrer le pointage manuel.' };
  }

  revalidatePath('/pointage');
  return { success: true };
}
