'use server';

import {
  createVehicleDocumentSchema,
  createVehicleMaintenanceLogSchema,
  createVehicleSchema,
  updateVehicleSchema,
  type CreateVehicleDocumentInput,
  type CreateVehicleInput,
  type CreateVehicleMaintenanceLogInput,
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
    photo_url: parsed.data.photo_url ?? null,
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
      ...(fields.photo_url !== undefined && { photo_url: fields.photo_url }),
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

/**
 * Field-coverage pass — `vehicles.photo_url` had no write path anywhere on
 * web. Same "own control, own action" shape as team's updateWorkerPhoto:
 * the photo is uploaded and confirmed from the detail page directly, not a
 * field inside the create/edit form's own submit.
 */
export async function updateVehiclePhoto(vehicleId: string, path: string): Promise<ActionResult> {
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

  const { error } = await supabase
    .from('vehicles')
    .update({ photo_url: path })
    .eq('id', vehicleId)
    .eq('org_id', profile.active_org_id);

  if (error) {
    return { success: false, error: "Impossible de mettre à jour la photo." };
  }

  revalidatePath(`/vehicles/${vehicleId}`);
  return { success: true };
}

/**
 * Field-coverage pass — `createVehicleMaintenanceLogSchema` already existed
 * in @dala/validation (built for mobile) but had no web action calling it.
 * Append-only per migration 0073's own header — no update/delete variant.
 */
export async function createMaintenanceLogEntry(
  input: CreateVehicleMaintenanceLogInput,
): Promise<ActionResult> {
  const parsed = createVehicleMaintenanceLogSchema.safeParse(input);
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

  const { error } = await supabase.from('vehicle_maintenance_log').insert({
    org_id: profile.active_org_id,
    vehicle_id: parsed.data.vehicle_id,
    log_date: parsed.data.log_date,
    description: parsed.data.description,
    cost: parsed.data.cost ?? null,
    logged_by: user.id,
  });

  if (error) {
    return { success: false, error: "Impossible d'ajouter l'entrée de maintenance." };
  }

  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  return { success: true };
}

/**
 * Field-coverage pass — same situation as createMaintenanceLogEntry:
 * `createVehicleDocumentSchema` already existed in @dala/validation with no
 * web action calling it. Append-only per migration 0073's own header — the
 * "current" document per type is resolved at query time (DISTINCT ON /
 * client-side reduce), never an update to a prior row.
 */
export async function createVehicleDocument(
  input: CreateVehicleDocumentInput,
): Promise<ActionResult> {
  const parsed = createVehicleDocumentSchema.safeParse(input);
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

  const { error } = await supabase.from('vehicle_documents').insert({
    org_id: profile.active_org_id,
    vehicle_id: parsed.data.vehicle_id,
    document_type: parsed.data.document_type,
    document_url: parsed.data.document_url ?? null,
    expires_at: parsed.data.expires_at,
    recorded_by: user.id,
  });

  if (error) {
    return { success: false, error: "Impossible d'ajouter le document." };
  }

  revalidatePath(`/vehicles/${parsed.data.vehicle_id}`);
  return { success: true };
}
