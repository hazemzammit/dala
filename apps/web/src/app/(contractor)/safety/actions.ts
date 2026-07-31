'use server';

import {
  createOrgInsuranceSchema,
  createPpeChecklistSchema,
  createRiskAlertSchema,
  createSafetyIncidentSchema,
  type CreateOrgInsuranceInput,
  type CreatePpeChecklistInput,
  type CreateRiskAlertInput,
  type CreateSafetyIncidentInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

export async function createSafetyIncident(
  input: CreateSafetyIncidentInput,
): Promise<ActionResult> {
  const parsed = createSafetyIncidentSchema.safeParse(input);
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

  const { error } = await supabase.from('safety_incidents').insert({
    org_id: profile.active_org_id,
    description: parsed.data.description,
    severity: parsed.data.severity,
    photo_url: parsed.data.photo_path ?? null,
    reported_by: user.id,
  });

  if (error) {
    return { success: false, error: "Impossible d'enregistrer l'incident. Vérifiez vos droits." };
  }

  revalidatePath('/safety');
  return { success: true };
}

/** Doc 01 §1.5 — org_insurances write policy is owner-only (migration
 *  0005), stricter than most tables here (owner+manager) — the error
 *  message says so explicitly rather than reusing the generic wording. */
export async function createOrgInsurance(input: CreateOrgInsuranceInput): Promise<ActionResult> {
  const parsed = createOrgInsuranceSchema.safeParse(input);
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

  const { error } = await supabase.from('org_insurances').insert({
    org_id: profile.active_org_id,
    provider_name: parsed.data.provider_name,
    policy_number: parsed.data.policy_number ?? null,
    expires_at: parsed.data.expires_at ?? null,
  });

  if (error) {
    return {
      success: false,
      error: "Impossible d'ajouter cette assurance. Seul le propriétaire peut le faire.",
    };
  }

  revalidatePath('/safety');
  return { success: true };
}
export async function createPpeChecklist(input: CreatePpeChecklistInput): Promise<ActionResult> {
  const parsed = createPpeChecklistSchema.safeParse(input);
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

  const { error } = await supabase.from('ppe_checklists').insert({
    org_id: profile.active_org_id,
    project_id: parsed.data.project_id ?? null,
    item: parsed.data.item,
    compliant: parsed.data.compliant,
    checked_by: user.id,
  });

  if (error) {
    return { success: false, error: "Impossible d'enregistrer. Vérifiez vos droits." };
  }

  revalidatePath('/safety');
  return { success: true };
}

export async function createRiskAlert(input: CreateRiskAlertInput): Promise<ActionResult> {
  const parsed = createRiskAlertSchema.safeParse(input);
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

  const { error } = await supabase.from('risk_alerts').insert({
    org_id: profile.active_org_id,
    project_id: parsed.data.project_id ?? null,
    description: parsed.data.description,
    severity: parsed.data.severity,
    created_by: user.id,
  });

  if (error) {
    return { success: false, error: "Impossible d'enregistrer. Vérifiez vos droits." };
  }

  revalidatePath('/safety');
  return { success: true };
}
