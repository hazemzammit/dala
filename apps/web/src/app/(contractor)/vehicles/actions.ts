'use server';

import {
  createVehicleSchema,
  updateVehicleSchema,
  type CreateVehicleInput,
  type UpdateVehicleInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

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
  const { id, ...fields } = parsed.data;

  const { error } = await supabase
    .from('vehicles')
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.plate !== undefined && { plate: fields.plate }),
      ...(fields.capacity !== undefined && { capacity: fields.capacity }),
      ...(fields.status !== undefined && { status: fields.status }),
    })
    .eq('id', id);

  if (error) {
    return { success: false, error: 'Impossible de modifier le véhicule. Vérifiez vos droits.' };
  }

  revalidatePath('/vehicles');
  return { success: true };
}
