'use server';

import { inviteWorkerSchema, type InviteWorkerInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

const updateWorkerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(2),
  phone: z.string().min(8),
  trade: z.string().optional(),
  daily_rate: z.number().positive().optional(),
});

type UpdateWorkerInput = z.infer<typeof updateWorkerSchema>;

/**
 * Doc 06 §6.4 — creating a worker + sending an invitation are one user
 * action ("Inviter un ouvrier") but two DB writes (workers, then
 * worker_invitations), since worker_invitations.worker_id is a FK.
 *
 * Doc 07 §7.4 — invitation tokens: 7-day expiry, single use. expires_at
 * has a DB default (now() + 7 days, migration 0004) so it's not set here.
 *
 * No SMS/WhatsApp integration exists yet in supabase/functions — the
 * generated invite link is returned to the caller to display/copy
 * manually, same stopgap pattern already used for RESEND_API_KEY being
 * unset locally. Flagged for Hazem — real delivery isn't wired up.
 */
export async function inviteWorker(
  input: InviteWorkerInput,
): Promise<ActionResult & { inviteLink?: string }> {
  const parsed = inviteWorkerSchema.safeParse(input);
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

  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .insert({
      org_id: profile.active_org_id,
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      trade: parsed.data.trade ?? null,
      daily_rate: parsed.data.daily_rate ?? null,
    })
    .select('id')
    .single();

  if (workerError || !worker) {
    return { success: false, error: "Impossible de créer l'ouvrier. Vérifiez vos droits." };
  }

  const token = crypto.randomUUID();

  const { error: invitationError } = await supabase.from('worker_invitations').insert({
    worker_id: worker.id,
    token,
    channel: parsed.data.channel,
  });

  if (invitationError) {
    return {
      success: false,
      error: "Ouvrier créé, mais l'invitation n'a pas pu être générée.",
    };
  }

  revalidatePath('/team');
  return {
    success: true,
    inviteLink: `${process.env.NEXT_PUBLIC_APP_URL}/invite/worker?token=${token}`,
  };
}

export async function updateWorker(input: UpdateWorkerInput): Promise<ActionResult> {
  const parsed = updateWorkerSchema.safeParse(input);
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
    .from('workers')
    .update({
      full_name: parsed.data.full_name,
      phone: parsed.data.phone,
      trade: parsed.data.trade ?? null,
      daily_rate: parsed.data.daily_rate ?? null,
    })
    .eq('id', parsed.data.id)
    .eq('org_id', profile.active_org_id);

  if (error) {
    return { success: false, error: 'Impossible de modifier l’ouvrier. Vérifiez vos droits.' };
  }

  revalidatePath('/team');
  return { success: true };
}
