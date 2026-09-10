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

/**
 * Phase 10 (§4.2) — the six new org profile fields, kept as a SEPARATE
 * schema from updateOrganizationSchema above rather than folded into it,
 * mirroring how updateOrganizationLegalFieldsSchema is already its own
 * schema below: these map to a different RPC (update_organization_
 * extended_profile, migration 0075's Part 1 columns) than the original
 * nine-argument update_organization_profile (0028), which this phase
 * deliberately leaves byte-for-byte unchanged rather than widening its
 * signature — same "small diff, don't touch what already works" reasoning
 * Phase 2's migration 0069 used for submit_site_log_entry.
 *
 * legal_form/workforce_size_bracket use the exact enum values the
 * migration's CHECK constraints define — kept here as z.enum, not
 * z.string(), so an invalid value is caught client-side before the RPC's
 * own CHECK constraint would reject it with a less friendly error.
 *
 * facebook_url/instagram_url/website_url ARE real .url() checks (unlike
 * logo_url/avatar_url above) — these hold actual external links, not
 * Storage paths, so .url() is the correct validator here, not a repeat of
 * the bare-path-vs-URL bug Phase 3 found on receipt_photo_url.
 */
export const updateOrganizationExtendedProfileSchema = z.object({
  legal_form: z.enum(['personne_physique', 'sarl', 'suarl', 'sa']).optional(),
  workforce_size_bracket: z.enum(['1', '2_10', '11_50', '51_plus']).optional(),
  facebook_url: z.string().url('URL Facebook invalide.').optional().or(z.literal('')),
  instagram_url: z.string().url('URL Instagram invalide.').optional().or(z.literal('')),
  website_url: z.string().url('URL invalide.').optional().or(z.literal('')),
  service_area: z.string().optional(),
});
export type UpdateOrganizationExtendedProfileInput = z.infer<
  typeof updateOrganizationExtendedProfileSchema
>;

/** Phase 10 (§4.2) — RIB, owner-only (see migration 0075's own header for
 *  the encryption decision). No format regex: RIB format validation is the
 *  same "pending accountant/lawyer review" open item updateOrganization
 *  LegalFieldsSchema's own comment already flags for matricule_fiscal/
 *  rc_number — not invented here for a field with the same open question.
 *  Empty string is valid input (clears a previously-set RIB). */
export const updateOrganizationRibSchema = z.object({
  rib: z.string().max(64, 'RIB trop long.'),
});
export type UpdateOrganizationRibInput = z.infer<typeof updateOrganizationRibSchema>;

/**
 * Org-creation wizard (create-organization.tsx) — a straight union of the
 * field-level rules already established by updateOrganizationSchema,
 * updateOrganizationExtendedProfileSchema, and
 * updateOrganizationLegalFieldsSchema (values copied from those schemas,
 * not re-invented). Kept as its own schema rather than folded into any of
 * the three above: those schemas are each consumed by working screens
 * (organization-settings.tsx's handleSave/handleSaveExtended) tied to a
 * specific RPC's argument shape, and widening one of them risks breaking
 * that screen. The wizard validates each step's fields against the
 * relevant slice of this schema, then still calls the same three existing
 * RPCs (create_organization_for_current_user, update_organization_profile,
 * update_organization_extended_profile) exactly as organization-
 * settings.tsx already does — no RPC signature changes.
 *
 * `name` is the only required field, matching organizations.name being the
 * one NOT NULL column with no system default (see migration 0003/0075).
 * RIB is deliberately excluded — collected only via organization-
 * settings.tsx's existing "Ajouter un RIB" sheet, never at creation.
 */
export const createOrganizationFullSchema = z.object({
  name: z.string().min(2, "Nom de l'entreprise requis."),
  trade_type: z.string().optional(),
  logo_url: z.string().optional(), // storage path, not a URL — see updateOrganizationSchema's logo_url comment
  address: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional(),
  matricule_fiscal: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Format invalide.')
    .optional(),
  rc_number: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/, 'Format invalide.')
    .optional(),
  legal_form: z.enum(['personne_physique', 'sarl', 'suarl', 'sa']).optional(),
  workforce_size_bracket: z.enum(['1', '2_10', '11_50', '51_plus']).optional(),
  facebook_url: z.string().url('URL Facebook invalide.').optional().or(z.literal('')),
  instagram_url: z.string().url('URL Instagram invalide.').optional().or(z.literal('')),
  website_url: z.string().url('URL invalide.').optional().or(z.literal('')),
  service_area: z.string().optional(),
});
export type CreateOrganizationFullInput = z.infer<typeof createOrganizationFullSchema>;

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

/** Doc 01 §1.3.12 — profile fields editable on the Profile screen.
 *  emergency_contact_name/phone added Phase 10 (§4.3) — both optional, and
 *  an empty string is valid (clears a previously-set contact), matching
 *  the rib schema's own "empty clears" convention above. */
export const updateProfileSchema = z.object({
  full_name: z.string().min(2).optional(),
  preferred_locale: z.enum(['fr', 'ar', 'en']).optional(),
  avatar_url: z.string().optional(), // storage path (lib/storage.ts), not a URL — same fix as logo_url above
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
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
