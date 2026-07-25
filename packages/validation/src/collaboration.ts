import { z } from 'zod';

/**
 * packages/validation/src/collaboration.ts
 *
 * Phase 4 — Doc 02 §2.8 org-to-org invite flow (invite_org_to_project /
 * accept_project_invitation RPCs, migration 0024). Structurally parallel to
 * dispatch.ts's inviteWorkerSchema, one level up (org invited onto a
 * project, not a worker invited into an org).
 */

/** Doc 02 §2.8 — lead org invites a trade org by phone or email. At least
 *  one contact method is required, matching the DB check constraint on
 *  project_invitations. */
export const inviteOrgToProjectSchema = z
  .object({
    project_id: z.string().uuid(),
    invited_phone: z.string().min(8, 'Numéro de téléphone invalide.').optional(),
    invited_email: z.string().email('Adresse e-mail invalide.').optional(),
    trade_type: z.string().optional(),
    sent_via: z.enum(['whatsapp', 'sms', 'email']),
  })
  .refine((v) => v.invited_phone || v.invited_email, {
    message: 'Indiquez un numéro de téléphone ou une adresse e-mail.',
    path: ['invited_phone'],
  });
export type InviteOrgToProjectInput = z.infer<typeof inviteOrgToProjectSchema>;

/** Doc 02 §2.8 — existing-account accept path (accept_project_invitation RPC).
 *  budget_rollup_opt_in is the "Partager mon budget consommé..." checkbox,
 *  default off per spec. */
export const acceptProjectInvitationSchema = z.object({
  token: z.string().min(1),
  budget_rollup_opt_in: z.boolean().default(false),
});
export type AcceptProjectInvitationInput = z.infer<typeof acceptProjectInvitationSchema>;

/** Doc 02 §2.8 — no-account path, carried through sign-up (see auth.ts's
 *  signUpSchema `org_invite_token` field and supabase/functions/sign-up). */
export const acceptProjectInvitationViaSignUpSchema = z.object({
  org_invite_token: z.string().min(1),
  org_invite_budget_rollup_opt_in: z.boolean().default(false),
});
export type AcceptProjectInvitationViaSignUpInput = z.infer<
  typeof acceptProjectInvitationViaSignUpSchema
>;

/** Doc 02 §2.8 report branding — trade org's opt-out flag on its own
 *  project_memberships row. Written directly via supabase-js .update(),
 *  same pattern as budget_rollup_opt_in's toggle — this schema exists so
 *  the payload shape is checked in one place rather than trusted ad hoc. */
export const updateProjectMembershipFlagsSchema = z.object({
  membership_id: z.string().uuid(),
  budget_rollup_opt_in: z.boolean().optional(),
  report_branding_opt_out: z.boolean().optional(),
});
export type UpdateProjectMembershipFlagsInput = z.infer<typeof updateProjectMembershipFlagsSchema>;
