'use server';

import {
  updateOrganizationMemberRoleSchema,
  type UpdateOrganizationMemberRoleInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — this went through two versions during this pass. The
 * collaborator's original imported a nonexistent `updateMemberRoleSchema`
 * and read a nonexistent `org_id` input field. My FIRST fix replaced that
 * with a scoped raw `.update()` on organization_members, reasoning (from
 * 0005's RLS policy alone) that no RPC existed for this table. That was
 * wrong — `update_organization_member_role` (migration 0028) DOES exist,
 * matching mobile's team-members.tsx exactly, and it enforces a real
 * business rule a raw update has no equivalent for: it blocks demoting the
 * organization's last remaining owner (including self), which would
 * otherwise leave the org with zero owners — nobody able to manage
 * billing, invite members, or change roles back. Caught by re-checking
 * against mobile's actual write path rather than assuming RLS coverage was
 * the same as an RPC's business-rule coverage — those are not the same
 * thing, and this pass's own earlier team/vehicles/projects fixes should
 * have made that more top-of-mind before the first attempt at this file.
 */
export async function updateMemberRole(
  input: UpdateOrganizationMemberRoleInput,
): Promise<ActionResult> {
  const parsed = updateOrganizationMemberRoleSchema.safeParse(input);
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

  const { error } = await supabase.rpc('update_organization_member_role', {
    p_org_id: profile.active_org_id,
    p_user_id: parsed.data.user_id,
    p_role: parsed.data.role,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/settings/roles');
  return { success: true };
}
