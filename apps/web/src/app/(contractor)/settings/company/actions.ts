'use server';

import { updateOrganizationSchema, type UpdateOrganizationInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — switched from a plain `.from('organizations').update()`
 * (the collaborator's original version) to the `update_organization_profile`
 * RPC, matching mobile's organization-settings.tsx exactly. Reason,
 * straight from that file's own comment: `organizations_update_owner_manager`
 * (0005) is a ROW-level RLS policy — it can't express "a manager may edit
 * name/trade_type/address/contact, but only the owner may edit
 * matricule_fiscal/rc_number." The RPC is what enforces that column-level
 * split. This action's own field list never touched those two restricted
 * columns, so the collaborator's version wasn't itself exploitable — but a
 * raw `.update()` call is a table-level capability with no column fence at
 * all; the only thing stopping a manager from adding matricule_fiscal to a
 * *future* edit of this same call would be a code reviewer noticing. The
 * RPC closes that off at the client-library level instead of relying on
 * every future caller remembering not to include the wrong field. Since
 * the RPC takes ALL nine args (not a partial update), the current row is
 * read first so untouched fields round-trip unchanged.
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

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return { success: false, error: 'Aucune organisation active.' };
  }

  const { data: current } = await supabase
    .from('organizations')
    .select(
      'name, trade_type, address, contact_phone, contact_email, matricule_fiscal, rc_number, logo_url',
    )
    .eq('id', profile.active_org_id)
    .single();
  if (!current) {
    return { success: false, error: 'Organisation introuvable.' };
  }

  const { error } = await supabase.rpc('update_organization_profile', {
    p_org_id: profile.active_org_id,
    p_name: parsed.data.name ?? current.name,
    p_trade_type: parsed.data.trade_type ?? current.trade_type,
    p_address: parsed.data.address ?? current.address,
    p_contact_phone: parsed.data.contact_phone ?? current.contact_phone,
    p_contact_email: parsed.data.contact_email ?? current.contact_email,
    p_matricule_fiscal: current.matricule_fiscal,
    p_rc_number: current.rc_number,
    p_logo_url: parsed.data.logo_url ?? current.logo_url,
  });

  if (error) {
    return {
      success: false,
      error: 'Impossible de modifier ces informations. Vérifiez vos droits.',
    };
  }

  revalidatePath('/settings/company');
  return { success: true };
}
