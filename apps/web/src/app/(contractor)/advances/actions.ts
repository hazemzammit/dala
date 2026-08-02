'use server';

import {
  approveAdvanceSchema,
  createAdvanceSchema,
  type ApproveAdvanceInput,
  type CreateAdvanceInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * Doc 01 §1.11 — idempotency_key generated client-side at click time.
 * NOTE: this checks/stores the key on the `advances` row itself rather
 * than a dedicated idempotency_keys table + request-hash check (Doc 01
 * §1.11.1's full design) — that's a larger piece of shared infrastructure
 * (server-side key lookup before every money-moving write) not built yet.
 * This is a partial mitigation (button disabled immediately + key stored
 * for audit) flagged for Hazem, not the complete spec'd mechanism.
 */
export async function createAdvance(input: CreateAdvanceInput): Promise<ActionResult> {
  const parsed = createAdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return { success: false, error: 'Aucune organisation active.' };
  }

  const { error } = await supabase.from('advances').insert({
    org_id: profile.active_org_id,
    worker_id: parsed.data.worker_id,
    amount: parsed.data.amount,
    reason: parsed.data.reason ?? null,
    requested_by: user.id,
    idempotency_key: parsed.data.idempotency_key,
  });

  if (error) {
    return { success: false, error: "Impossible d'enregistrer l'avance. Vérifiez vos droits." };
  }

  revalidatePath('/advances');
  return { success: true };
}

export async function approveAdvance(input: ApproveAdvanceInput): Promise<ActionResult> {
  const parsed = approveAdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { error } = await supabase
    .from('advances')
    .update({ status: 'approved', approved_by: user.id })
    .eq('id', parsed.data.advance_id);

  if (error) {
    return { success: false, error: 'Impossible d\u2019approuver cette avance.' };
  }

  revalidatePath('/advances');
  return { success: true };
}

export async function rejectAdvance(advanceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('advances')
    .update({ status: 'rejected' })
    .eq('id', advanceId);

  if (error) {
    return { success: false, error: 'Impossible de rejeter cette avance.' };
  }

  revalidatePath('/advances');
  return { success: true };
}
