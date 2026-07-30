import { z } from 'zod';

/** Doc 06 §6.8 — invite an independent company (trade or client) onto a project. */
export const createProjectInvitationSchema = z.object({
  project_id: z.string().uuid(),
  invited_org_name: z.string().min(2, "Nom de l'entreprise requis."),
  invited_contact_phone: z.string().min(8, 'Numéro de téléphone requis.'),
  role: z.enum(['trade', 'client']),
  channel: z.enum(['app', 'whatsapp', 'sms']),
});
export type CreateProjectInvitationInput = z.infer<typeof createProjectInvitationSchema>;
