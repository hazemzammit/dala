'use server';

import { updateOrganizationSchema, type UpdateOrganizationInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * Doc 01 §1.3.13 — org profile fields, editable by owner/manager. RLS
 * (organizations_write policy, migration 0005) enforces the role check;
 * this action resolves the active org and translates a denial into a
 * readable message.
 */
export async function updateOrganization(input: UpdateOrganizationInput): Promise<ActionResult> {
  const parsed = updateOrganizationSchema.safeParse(input);
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

  const { error } = await supabase
    .from('organizations')
    .update({
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.trade_type !== undefined && { trade_type: parsed.data.trade_type }),
      ...(parsed.data.address !== undefined && { address: parsed.data.address }),
      ...(parsed.data.contact_phone !== undefined && {
        contact_phone: parsed.data.contact_phone,
      }),
      ...(parsed.data.contact_email !== undefined && {
        contact_email: parsed.data.contact_email,
      }),
    })
    .eq('id', profile.active_org_id);

  if (error) {
    return {
      success: false,
      error: 'Impossible de modifier ces informations. Vérifiez vos droits.',
    };
  }

  revalidatePath('/settings/company');
  return { success: true };
}
