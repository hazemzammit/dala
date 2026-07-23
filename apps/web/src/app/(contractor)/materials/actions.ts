'use server';

import type { Material } from '@dala/shared-types';
import {
  createMaterialSchema,
  updateMaterialSchema,
  type CreateMaterialInput,
  type UpdateMaterialInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type MaterialMutationResult =
  { success: true; material: Material } | { success: false; error: string };

type DeleteMaterialResult =
  { success: true; materialId: string } | { success: false; error: string };

export async function createMaterial(input: CreateMaterialInput): Promise<MaterialMutationResult> {
  const parsed = createMaterialSchema.safeParse(input);
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

  const { data, error } = await supabase
    .from('materials')
    .insert({
      org_id: profile.active_org_id,
      project_id: parsed.data.project_id ?? null,
      item: parsed.data.item,
      quantity: parsed.data.quantity ?? null,
      urgency: parsed.data.urgency,
      note: parsed.data.note ?? null,
      status: parsed.data.status,
      created_by: user.id,
    })
    .select('*');

  if (error || !data || data.length === 0) {
    return { success: false, error: 'Impossible d’ajouter le matériau. Vérifiez vos droits.' };
  }

  revalidatePath('/materials');
  return { success: true, material: data[0] };
}

export async function updateMaterial(input: UpdateMaterialInput): Promise<MaterialMutationResult> {
  const parsed = updateMaterialSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const { id, ...fields } = parsed.data;
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

  const { data, error } = await supabase
    .from('materials')
    .update({
      ...(fields.project_id !== undefined && { project_id: fields.project_id ?? null }),
      ...(fields.item !== undefined && { item: fields.item }),
      ...(fields.quantity !== undefined && { quantity: fields.quantity ?? null }),
      ...(fields.urgency !== undefined && { urgency: fields.urgency }),
      ...(fields.note !== undefined && { note: fields.note ?? null }),
      ...(fields.status !== undefined && { status: fields.status }),
    })
    .eq('id', id)
    .eq('org_id', profile.active_org_id)
    .select('*');

  if (error || !data || data.length === 0) {
    return { success: false, error: 'Impossible de modifier le matériau. Vérifiez vos droits.' };
  }

  revalidatePath('/materials');
  return { success: true, material: data[0] };
}

export async function deleteMaterial(input: { id: string }): Promise<DeleteMaterialResult> {
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

  const { error, data } = await supabase
    .from('materials')
    .delete()
    .eq('id', input.id)
    .eq('org_id', profile.active_org_id)
    .select('id');

  if (error || !data || data.length === 0) {
    return { success: false, error: 'Impossible de supprimer le matériau. Vérifiez vos droits.' };
  }

  revalidatePath('/materials');
  return { success: true, materialId: input.id };
}
