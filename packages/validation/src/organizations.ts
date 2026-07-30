import { z } from 'zod';

import { passwordSchema } from './auth';

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
  logo_url: z.string().optional(), // storage path, e.g. `{orgId}/logo/{uuid}.png` — not a URL (lib/storage.ts)
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
  avatar_url: z.string().optional(), // storage path (lib/storage.ts), not a URL — same fix as logo_url above
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Doc 01 §1.3.12 — phone change requires a 6-digit SMS re-verification code. */
export const changePhoneSchema = z.object({
  new_phone: z.string().min(8),
});
export const confirmPhoneChangeSchema = z.object({
  code: z.string().length(6),
});

/**
 * Doc 03 §3.22.1 — email change is routed through Supabase Auth's own
 * built-in secure-email-change flow (supabase.auth.updateUser({ email })),
 * not a custom table, since it targets auth.users.email directly and
 * Supabase already double-confirms old+new addresses natively. This schema
 * is just the client-side format check before that call.
 */
export const requestEmailChangeSchema = z.object({
  new_email: z.string().email('Adresse e-mail invalide.'),
});
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;

/** Doc 03 §3.22 "Membres de l'équipe" — owner-only role change. */
export const updateOrganizationMemberRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['owner', 'manager', 'viewer']),
});
export type UpdateOrganizationMemberRoleInput = z.infer<typeof updateOrganizationMemberRoleSchema>;

/**
 * Doc 03 §3.22 "Supprimer mon compte" — the only safeguard against this
 * irreversible action is typing the exact confirmation word, matching the
 * spec's framing of this as a serious, deliberate action rather than a
 * one-tap toggle.
 */
export const deleteAccountConfirmSchema = z.object({
  confirmation: z.literal('SUPPRIMER', {
    errorMap: () => ({ message: 'Tapez SUPPRIMER pour confirmer.' }),
  }),
});
export type DeleteAccountConfirmInput = z.infer<typeof deleteAccountConfirmSchema>;

/** Doc 03 §3.22.4 (security) — password change via Supabase Auth. */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Mot de passe actuel requis.'),
    new_password: z.string().min(8, 'Au moins 8 caractères.'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirm_password'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Doc 03 §3.22 "Membres de l'équipe" — invite-by-email, cut from Phase 7,
 * built in migration 0030. 'owner' deliberately excluded — see 0030's
 * migration header for why ownership transfer isn't part of this pipeline.
 */
export const inviteOrganizationMemberSchema = z.object({
  org_id: z.string().uuid(),
  email: z.string().email("Merci d'indiquer une adresse e-mail valide."),
  role: z.enum(['manager', 'viewer']),
});
export type InviteOrganizationMemberInput = z.infer<typeof inviteOrganizationMemberSchema>;

/**
 * accept-organization-invite.tsx's no-account path — sets a password for a
 * brand-new account via the accept-organization-invitation Edge Function.
 * Mirrors workerSetPasswordSchema (auth.ts) exactly, one level up.
 */
export const organizationMemberSetPasswordSchema = z.object({
  invitation_token: z.string().min(1),
  password: passwordSchema,
});
export type OrganizationMemberSetPasswordInput = z.infer<
  typeof organizationMemberSetPasswordSchema
>;
