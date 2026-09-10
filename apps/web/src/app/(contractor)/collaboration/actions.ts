'use server';

import { inviteOrgToProjectSchema, type InviteOrgToProjectInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { createClient } from '@/lib/supabase/server';

type ActionResult =
  { success: true; emailWarning: string | null } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — this whole action is rewritten. The collaborator's
 * original imported `createProjectInvitationSchema` (doesn't exist — real
 * name `inviteOrgToProjectSchema`, collaboration.ts) and did a raw
 * `.insert()` on project_invitations with a CLIENT-GENERATED token
 * (`crypto.randomUUID()`) and a column set that doesn't match the real
 * table at all: it wrote `inviting_org_id`/`invited_org_name`/
 * `invited_contact_phone`/`channel`/`role`, none of which exist — the real
 * columns are `lead_org_id`/`invited_phone`/`invited_email`/`trade_type`/
 * `sent_via` (migration 0024). This insert would have failed outright.
 *
 * More importantly, unlike worker invites (still a real, disclosed
 * delivery gap — no send function exists for those), this feature already
 * has BOTH a real RPC (`invite_org_to_project`, which generates its own
 * token server-side rather than trusting a client-supplied one) AND a real
 * email-delivery edge function (`send-project-invitation-email`, Resend-
 * backed) for the `sent_via: 'email'` case. The collaborator's version
 * used none of this and would have shipped a strictly worse, broken
 * version of a feature that's actually already fully built server-side.
 * Rewritten to match mobile's collaboration.tsx exactly. whatsapp/sms
 * still have no delivery wired up (same disclosed gap as worker invites)
 * — only email actually sends.
 */
export async function createProjectInvitation(
  input: InviteOrgToProjectInput,
): Promise<ActionResult> {
  const parsed = inviteOrgToProjectSchema.safeParse(input);
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

  const { data: invitationId, error: rpcError } = await supabase.rpc('invite_org_to_project', {
    p_project_id: parsed.data.project_id,
    p_invited_phone: parsed.data.invited_phone ?? null,
    p_invited_email: parsed.data.invited_email ?? null,
    p_trade_type: parsed.data.trade_type ?? null,
    p_sent_via: parsed.data.sent_via,
  });

  if (rpcError || !invitationId) {
    return { success: false, error: "Impossible d'envoyer l'invitation. Vérifiez vos droits." };
  }

  let emailWarning: string | null = null;
  if (parsed.data.sent_via === 'email') {
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'send-project-invitation-email',
      { body: { invitation_id: invitationId } },
    );
    if (fnError || !fnData?.success) {
      emailWarning = "L'invitation a été créée, mais l'e-mail n'a pas pu être envoyé.";
    }
  }

  revalidatePath('/collaboration');
  return { success: true, emailWarning };
}
