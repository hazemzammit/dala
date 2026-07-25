import { z } from 'zod';

/**
 * Doc 01 §1.3.6 — password policy: minimum 10 characters, no forced
 * complexity theater. Client-side strength meter (zxcvbn) is a UX layer on
 * top of this, not a replacement for it.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères.');

/**
 * Doc 01 §1.3.3 — contractor sign-up, creating a new organization.
 *
 * `org_invite_token` / `org_invite_budget_rollup_opt_in` — Phase 4 addition
 * (Doc 02 §2.8). Set only when this sign-up was reached via an org-to-org
 * invite deep link for a contact with no existing account yet ("the invite
 * doubles as an onboarding link into the standard sign-up flow... it just
 * pre-fills organization context" — it must NOT skip this schema or this
 * screen). Both optional and additive: a sign-up with neither field behaves
 * exactly as before this pass. See supabase/functions/sign-up for what it
 * does with them once the new organization exists.
 */
export const signUpSchema = z.object({
  full_name: z.string().min(2, 'Nom complet requis.'),
  email: z.string().email('Adresse e-mail invalide.'),
  password: passwordSchema,
  phone: z.string().min(8, 'Numéro de téléphone invalide.'),
  organization_name: z.string().min(2, "Nom de l'entreprise requis."),
  trade_type: z.string().optional(),
  org_invite_token: z.string().optional(),
  org_invite_budget_rollup_opt_in: z.boolean().optional(),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Doc 01 §1.3.5 — login flow. */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Mot de passe requis.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Doc 01 §1.3.7 — forgot password: only collects the email. */
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Doc 01 §1.3.7 — reset password screen, reached via the emailed link. */
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  new_password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Doc 01 §1.3.4 — worker "set your password" screen after accepting an
 * invite. Email/phone are pre-filled and not user-editable, so they aren't
 * part of this input schema at all (the server resolves them from the
 * invitation token, not from client-submitted fields).
 */
export const workerSetPasswordSchema = z.object({
  invitation_token: z.string().min(1),
  password: passwordSchema,
});
export type WorkerSetPasswordInput = z.infer<typeof workerSetPasswordSchema>;

/** Doc 01 §1.3.13 — "Create organization" flow for an already-logged-in user. */
export const createOrganizationSchema = z.object({
  name: z.string().min(2, "Nom de l'entreprise requis."),
  trade_type: z.string().optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
