'use server';

import {
  createOrgInsuranceSchema,
  createSafetyIncidentSchema,
  type CreateOrgInsuranceInput,
  type CreateSafetyIncidentInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — this whole safety/ route originally had four
 * sub-features: incidents, insurance, "PPE checklist", and "risk alerts".
 * Only the first two have any backing at all in this schema (migration
 * 0008's safety_incidents/org_insurances tables, matching mobile's
 * safety.tsx exactly). There is NO ppe_checklists or risk_alerts table,
 * no RLS policy, and no validation schema for either anywhere in this
 * repo — the collaborator's PPE/risk-alert form modals and actions
 * (createPpeChecklistSchema, createRiskAlertSchema) referenced schemas
 * that plain don't exist. This isn't a field-level gap like most of the
 * other routes — it's two entire product features with zero backend.
 * Dropped both rather than fabricate tables (migrations are explicitly
 * off-limits for this pass) or guess at a shape. If these are wanted,
 * they need real migrations + RLS policies first, then this route can be
 * extended — worth a product conversation, not something to wing here.
 */
export async function createSafetyIncident(
  input: CreateSafetyIncidentInput & { photo_path?: string },
): Promise<ActionResult> {
  const { photo_path, ...rest } = input;
  const parsed = createSafetyIncidentSchema.safeParse({ ...rest, photo_url: photo_path });
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

  const { data: incident, error } = await supabase
    .from('safety_incidents')
    .insert({
      org_id: profile.active_org_id,
      project_id: parsed.data.project_id ?? null,
      description: parsed.data.description,
      severity: parsed.data.severity,
      incident_type: parsed.data.incident_type,
      location: parsed.data.location ?? null,
      photo_url: parsed.data.photo_url ?? null,
      reported_by: user.id,
    })
    .select('id')
    .single();

  if (error || !incident) {
    return { success: false, error: "Impossible d'enregistrer l'incident. Vérifiez vos droits." };
  }

  // Migration 0020 — involved workers are a real many-to-many join table
  // (safety_incident_workers), not an array column.
  if (parsed.data.involved_worker_ids?.length) {
    const { error: joinError } = await supabase.from('safety_incident_workers').insert(
      parsed.data.involved_worker_ids.map((workerId) => ({
        incident_id: incident.id,
        worker_id: workerId,
      })),
    );
    if (joinError) {
      return {
        success: false,
        error: "Incident enregistré, mais l'association des ouvriers a échoué.",
      };
    }
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

  const { error } = await supabase.from('org_insurances').insert({
    org_id: profile.active_org_id,
    provider_name: parsed.data.provider_name,
    policy_number: parsed.data.policy_number ?? null,
    coverage_type: parsed.data.coverage_type ?? null,
    document_url: parsed.data.document_url ?? null,
    expires_at: parsed.data.expires_at,
    reminder_enabled: parsed.data.reminder_enabled,
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
