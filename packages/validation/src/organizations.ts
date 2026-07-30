import { z } from 'zod';

/**
 * Doc 01 §1.3.13 — org profile fields editable by owner/manager.
 * matricule_fiscal / rc_number are owner-only at the RBAC layer (enforced by
 * RLS, not by this schema) but are still validated here loosely — the real
 * format-validation regex is an open item pending accountant/lawyer review
 * (Doc 00 §0.5 item 9), so only "non-empty alphanumeric" is checked for now.
 */
export const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  trade_type: z.string().optional(),
  logo_url: z.string().url().optional(),
  address: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/** Owner-only fields — kept in a separate schema so a form/API can enforce
 *  the stricter permission boundary explicitly rather than by convention. */
export const updateOrganizationLegalFieldsSchema = z.object({
  matricule_fiscal: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Format invalide.')
    .optional(),
  rc_number: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Format invalide.')
    .optional(),
});
export type UpdateOrganizationLegalFieldsInput = z.infer<
  typeof updateOrganizationLegalFieldsSchema
>;

/** Doc 01 §1.3.12 — profile fields editable on the Profile screen. */
export const updateProfileSchema = z.object({
  full_name: z.string().min(2).optional(),
  preferred_locale: z.enum(['fr', 'ar', 'en']).optional(),
  avatar_url: z.string().url().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Doc 01 §1.3.12 — phone change requires a 6-digit SMS re-verification code. */
export const changePhoneSchema = z.object({
  new_phone: z.string().min(8),
});
export const confirmPhoneChangeSchema = z.object({
  code: z.string().length(6),
});
/** Doc 06 §6.9 — change a member's role. Owner-only at the RLS layer
 *  (organization_members_write_owner policy, migration 0005); this schema
 *  just validates shape. Excludes 'owner' from the target value — a
 *  transfer-of-ownership flow, if ever built, should be its own explicit
 *  action, not a side effect of this generic role-change form. */
export const updateMemberRoleSchema = z.object({
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(['manager', 'viewer']),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
