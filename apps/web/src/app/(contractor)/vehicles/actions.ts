'use server';

import {
  createVehicleSchema,
  updateVehicleSchema,
  type CreateVehicleInput,
  type UpdateVehicleInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

export async function createVehicle(input: CreateVehicleInput): Promise<ActionResult> {
  const parsed = createVehicleSchema.safeParse(input);
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

  const { error } = await supabase.from('vehicles').insert({
    org_id: profile.active_org_id,
    name: parsed.data.name,
    plate: parsed.data.plate ?? null,
    capacity: parsed.data.capacity,
    status: parsed.data.status,
  });

  if (error) {
    console.error('createVehicle error:', error);
    return { success: false, error: "Impossible d'ajouter le véhicule. Vérifiez vos droits." };
  }

  revalidatePath('/vehicles');
  return { success: true };
}

export async function updateVehicle(input: UpdateVehicleInput): Promise<ActionResult> {
  const parsed = updateVehicleSchema.safeParse(input);
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

  const { id, version, ...fields } = parsed.data;

  // Migration 0046 optimistic concurrency: the update only succeeds if the
  // row's version still matches what was read. version is bumped by a
  // trigger, so we don't set it here — we only gate on it. The original
  // action here had neither an org_id scope (any authenticated user could
  // target a vehicle id in a different org) nor a version check at all.
  const { data: updated, error } = await supabase
    .from('vehicles')
    .update({
      name: fields.name,
      plate: fields.plate,
      capacity: fields.capacity,
      status: fields.status,
      version: version + 1,
    })
    .eq('id', id)
    .eq('org_id', profile.active_org_id)
    .eq('version', version)
    .select('id')
    .maybeSingle();

  if (error) {
    return { success: false, error: 'Impossible de modifier le véhicule. Vérifiez vos droits.' };
  }
  if (!updated) {
    return {
      success: false,
      error: 'Ce véhicule a été modifié entre-temps. Rechargez la page et réessayez.',
    };
  }

  revalidatePath('/vehicles');
  return { success: true };
}

/** Migration 0076 — 30-day recoverable soft-delete, matching mobile's Trash flow. */
export async function deleteVehicle(vehicleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { error } = await supabase.rpc('soft_delete_vehicle', { p_vehicle_id: vehicleId });
  if (error) {
    return { success: false, error: 'Impossible de supprimer ce véhicule.' };
  }

  revalidatePath('/vehicles');
  return { success: true };
}
