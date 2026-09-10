'use server';

import {
  approveAdvanceSchema,
  createAdvanceSchema,
  rejectAdvanceSchema,
  type ApproveAdvanceInput,
  type CreateAdvanceInput,
  type RejectAdvanceInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — createAdvance/approveAdvance rewritten to use the
 * real `create_advance`/`approve_advance` RPCs (migration 0019, extended
 * by 0048), matching mobile's advances.tsx exactly. The collaborator's
 * original version did a plain `.insert()`/`.update()` on the `advances`
 * table directly — money-moving writes, which is exactly the class of
 * operation Doc 01 §1.11's idempotency design exists for. The RPCs do real
 * request-hash-checked idempotency-key dedup (via the shared
 * idempotency_keys table) so a double-tap or a retried request after a
 * timeout can't create two advances or approve the same one twice; a raw
 * insert/update has no equivalent protection — the idempotency_key column
 * would just get stored on the row for later audit, never actually
 * checked before the write happens.
 *
 * rejectAdvance's write shape is UNCHANGED (still a scoped raw update, not
 * an RPC) — that's correct as-is: mobile's own comment on this exact
 * action says rejection isn't in Doc 01 §1.11.3's mandatory-idempotency
 * list, only creation/approval/mark-paid are, so a plain update under
 * advances_write_owner_manager is sufficient. Not everything the
 * collaborator wrote here was wrong.
 *
 * Phase 19F / migration 0090 — approveAdvance and rejectAdvance both now
 * take a mandatory `reason` (Doc 05 §1.7c Tier 3), persisted to
 * `advances.manager_reason` — distinct from `advances.reason`, the
 * worker's own stated reason for requesting the advance, set at creation.
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

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return { success: false, error: 'Aucune organisation active.' };
  }

  const { error } = await supabase.rpc('create_advance', {
    p_org_id: profile.active_org_id,
    p_worker_id: parsed.data.worker_id,
    p_amount: parsed.data.amount,
    p_reason: parsed.data.reason ?? null,
    p_idempotency_key: parsed.data.idempotency_key,
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

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { error } = await supabase.rpc('approve_advance', {
    p_advance_id: parsed.data.advance_id,
    p_idempotency_key: parsed.data.idempotency_key,
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { success: false, error: 'Impossible d’approuver cette avance.' };
  }

  revalidatePath('/advances');
  return { success: true };
}

export async function rejectAdvance(input: RejectAdvanceInput): Promise<ActionResult> {
  const parsed = rejectAdvanceSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };
  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { error } = await supabase
    .from('advances')
    .update({ status: 'rejected', manager_reason: parsed.data.reason })
    .eq('id', parsed.data.advance_id);

  if (error) {
    return { success: false, error: 'Impossible de rejeter cette avance.' };
  }

  revalidatePath('/advances');
  return { success: true };
}
