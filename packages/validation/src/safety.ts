import { z } from 'zod';

/** Doc 06 §safety — incident. No `location` column in DB, no
 *  involved-workers link table yet — flagged for Hazem, not invented. */
export const createSafetyIncidentSchema = z.object({
  description: z.string().min(2, 'Description requise.'),
  severity: z.enum(['minor', 'moderate', 'severe']),
  photo_path: z.string().optional(),
});
export type CreateSafetyIncidentInput = z.infer<typeof createSafetyIncidentSchema>;

/** Doc 06 §safety — org insurance policy. No coverage_type/reminder_enabled
 *  columns in DB yet — flagged for Hazem, not invented. */
export const createOrgInsuranceSchema = z.object({
  provider_name: z.string().min(2, 'Fournisseur requis.'),
  policy_number: z.string().optional(),
  expires_at: z.string().date().optional(),
});
export type CreateOrgInsuranceInput = z.infer<typeof createOrgInsuranceSchema>;
/** PPE checklist entry — not in cahier des charges §6, UI-mock-only feature. */
export const createPpeChecklistSchema = z.object({
  project_id: z.string().uuid().optional(),
  item: z.string().min(2, 'Élément requis.'),
  compliant: z.boolean(),
});
export type CreatePpeChecklistInput = z.infer<typeof createPpeChecklistSchema>;

/** Risk alert — not in cahier des charges §6, UI-mock-only feature. */
export const createRiskAlertSchema = z.object({
  project_id: z.string().uuid().optional(),
  description: z.string().min(2, 'Description requise.'),
  severity: z.enum(['low', 'medium', 'high']),
});
export type CreateRiskAlertInput = z.infer<typeof createRiskAlertSchema>;
