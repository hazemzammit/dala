'use server';

import { updateMemberRoleSchema, type UpdateMemberRoleInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

export async function updateMemberRole(input: UpdateMemberRoleInput): Promise<ActionResult> {
  const parsed = updateMemberRoleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { error } = await supabase
    .from('organization_members')
    .update({ role: parsed.data.role })
    .eq('org_id', parsed.data.org_id)
    .eq('user_id', parsed.data.user_id);

  if (error) {
    return {
      success: false,
      error: 'Impossible de modifier ce rôle. Seul le propriétaire peut le faire.',
    };
  }

  revalidatePath('/settings/roles');
  return { success: true };
}
