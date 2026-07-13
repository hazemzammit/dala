import { z } from 'zod';

/**
 * Doc 01 §1.3.6 — password policy: minimum 10 characters, no forced
 * complexity theater. Client-side strength meter (zxcvbn) is a UX layer on
 * top of this, not a replacement for it.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères.');

/** Doc 01 §1.3.3 — contractor sign-up, creating a new organization. */
export const signUpSchema = z.object({
  full_name: z.string().min(2, 'Nom complet requis.'),
  email: z.string().email('Adresse e-mail invalide.'),
  password: passwordSchema,
  phone: z.string().min(8, 'Numéro de téléphone invalide.'),
  organization_name: z.string().min(2, "Nom de l'entreprise requis."),
  trade_type: z.string().optional(),
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
