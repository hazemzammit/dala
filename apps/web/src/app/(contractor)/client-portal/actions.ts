'use server';

import type { ClientPortal } from '@dala/shared-types';
import { setClientPortalPinSchema } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

/**
 * Field-coverage pass — client-portal management (Doc 03 §3.18) had no web
 * screen at all: mobile's client-portal.tsx calls three real RPCs
 * (migration 0020) that had no web caller anywhere. These three actions
 * wrap the same RPCs mobile already uses, unchanged — no new backend
 * logic, purely a missing web caller.
 */
type ActionResult =
  | { success: true; portal: ClientPortal }
  | { success: false; error: string };

export async function generateClientPortalLink(projectId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data, error } = await supabase.rpc('generate_client_portal_link', {
    p_project_id: projectId,
  });
  if (error || !data) {
    return { success: false, error: 'Impossible de générer le lien.' };
  }

  revalidatePath('/client-portal');
  return { success: true, portal: data as ClientPortal };
}

export async function setClientPortalPin(input: {
  project_id: string;
  pin: string;
}): Promise<ActionResult> {
  const parsed = setClientPortalPinSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Code PIN invalide.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data, error } = await supabase.rpc('set_client_portal_pin', {
    p_project_id: parsed.data.project_id,
    p_pin: parsed.data.pin,
  });
  if (error || !data) {
    return { success: false, error: "Impossible de définir le code PIN." };
  }

  revalidatePath('/client-portal');
  return { success: true, portal: data as ClientPortal };
}

export async function disableClientPortalPin(projectId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data, error } = await supabase.rpc('disable_client_portal_pin', {
    p_project_id: projectId,
  });
  if (error || !data) {
    return { success: false, error: 'Impossible de désactiver le code PIN.' };
  }

  revalidatePath('/client-portal');
  return { success: true, portal: data as ClientPortal };
}
