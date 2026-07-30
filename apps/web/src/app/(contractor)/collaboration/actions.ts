'use server';

import { createProjectInvitationSchema, type CreateProjectInvitationInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true; inviteLink: string } | { success: false; error: string };

/**
 * Doc 06 §6.8 — invite an independent company onto a project. No real
 * SMS/WhatsApp delivery wired up yet (same stopgap as worker invites) —
 * the generated link is returned for manual copy/paste.
 */
export async function createProjectInvitation(
  input: CreateProjectInvitationInput,
): Promise<ActionResult> {
  const parsed = createProjectInvitationSchema.safeParse(input);
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

  const token = crypto.randomUUID();

  const { error } = await supabase.from('project_invitations').insert({
    project_id: parsed.data.project_id,
    inviting_org_id: profile.active_org_id,
    invited_org_name: parsed.data.invited_org_name,
    invited_contact_phone: parsed.data.invited_contact_phone,
    role: parsed.data.role,
    channel: parsed.data.channel,
    token,
  });

  if (error) {
    return { success: false, error: "Impossible d'envoyer l'invitation. Vérifiez vos droits." };
  }

  revalidatePath('/collaboration');
  return {
    success: true,
    inviteLink: `${process.env.NEXT_PUBLIC_APP_URL}/invite/project?token=${token}`,
  };
}
