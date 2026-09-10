'use server';

import type { Material } from '@dala/shared-types';
import {
  createMaterialRequestSchema,
  setMaterialCostSchema,
  refuseMaterialSchema,
  type CreateMaterialRequestInput,
  type SetMaterialCostInput,
  type RefuseMaterialInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { checkProjectIsWritable } from '@/lib/projectStatus';
import { createClient } from '@/lib/supabase/server';

type MaterialMutationResult =
  { success: true; material: Material } | { success: false; error: string };
type ApproveMaterialResult =
  | { success: true; expensePushed: boolean; expenseSkippedReason: string | null }
  | { success: false; error: string };
type ActionResult = { success: true } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — this whole file replaces the collaborator's original
 * actions.ts, which imported `createMaterialSchema`/`updateMaterialSchema`
 * from @dala/validation. Neither exists in this repo — the real schemas are
 * `createMaterialRequestSchema`/`setMaterialCostSchema`/
 * `refuseMaterialSchema` (fieldOps.ts). More importantly, the original
 * `updateMaterial` action let the caller set `status` to ANY value
 * (including 'approved') via a plain update. That would have bypassed
 * `approve_material_request()` entirely — silently skipping the
 * project_expenses push migration 0073 specifically built approval around.
 * Split into createMaterial / setMaterialCost / approveMaterial /
 * rejectMaterial, matching mobile's materials.tsx exactly rather than one
 * generic update that could reach a state only the RPC should be able to
 * reach.
 */
export async function createMaterial(
  input: CreateMaterialRequestInput,
): Promise<MaterialMutationResult> {
  const parsed = createMaterialRequestSchema.safeParse(input);
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

  if (parsed.data.project_id) {
    const projectError = await checkProjectIsWritable(
      supabase,
      parsed.data.project_id,
      profile.active_org_id,
    );
    if (projectError) return { success: false, error: projectError };
  }

  const { data, error } = await supabase
    .from('materials')
    .insert({
      org_id: profile.active_org_id,
      project_id: parsed.data.project_id ?? null,
      item: parsed.data.item,
      quantity: parsed.data.quantity ?? null,
      urgency: parsed.data.urgency,
      note: parsed.data.note ?? null,
      cost: parsed.data.cost ?? null,
      status: 'pending',
      created_by: user.id,
    })
    .select('*');

  if (error || !data || data.length === 0) {
    return { success: false, error: 'Impossible de créer la demande. Vérifiez vos droits.' };
  }

  revalidatePath('/materials');
  return { success: true, material: data[0] };
}

/** Mirrors mobile's persistCostAndProjectEdits — plain update, no RPC (0073's own comment). */
export async function setMaterialCost(input: SetMaterialCostInput): Promise<ActionResult> {
  const parsed = setMaterialCostSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  // §2.8 — these three functions had no explicit auth check before (relied
  // on RLS alone); fetching the user here is additive, not a behavior
  // change for an authenticated+verified caller, and gives a real error
  // instead of a raw Postgres/RLS failure for an unauthenticated one.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };
  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { error } = await supabase
    .from('materials')
    .update({ cost: parsed.data.cost, project_id: parsed.data.project_id })
    .eq('id', parsed.data.material_id);

  if (error) {
    return { success: false, error: 'Impossible de mettre à jour le coût.' };
  }

  revalidatePath('/materials');
  return { success: true };
}

/** Idempotency-checked, mirrors mobile's handleApprove exactly. */
export async function approveMaterial(materialId: string): Promise<ApproveMaterialResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };
  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { data, error } = await supabase
    .rpc('approve_material_request', {
      p_material_id: materialId,
      p_idempotency_key: crypto.randomUUID(),
    })
    .single();

  if (error) {
    return { success: false, error: "Impossible d'approuver cette demande." };
  }

  const result = data as { expense_pushed: boolean; expense_skipped_reason: string | null } | null;
  revalidatePath('/materials');
  return {
    success: true,
    expensePushed: result?.expense_pushed ?? false,
    expenseSkippedReason: result?.expense_skipped_reason ?? null,
  };
}

export async function rejectMaterial(input: RefuseMaterialInput): Promise<ActionResult> {
  const parsed = refuseMaterialSchema.safeParse(input);
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
    .from('materials')
    .update({ status: 'rejected', rejection_reason: parsed.data.rejection_reason })
    .eq('id', parsed.data.material_id);

  if (error) {
    return { success: false, error: 'Impossible de refuser cette demande.' };
  }

  revalidatePath('/materials');
  return { success: true };
}

export async function deleteMaterial(materialId: string): Promise<ActionResult> {
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

  const { error, data } = await supabase
    .from('materials')
    .delete()
    .eq('id', materialId)
    .eq('org_id', profile.active_org_id)
    .select('id');

  if (error || !data || data.length === 0) {
    return { success: false, error: 'Impossible de supprimer le matériau. Vérifiez vos droits.' };
  }

  revalidatePath('/materials');
  return { success: true };
}
