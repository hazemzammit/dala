'use server';

import { inviteWorkerSchema, type InviteWorkerInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireVerifiedEmail } from '@/lib/emailVerification';
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
 * Doc 03 §3.13.2 / migration 0018 — worker creation + invitation is a single
 * server-side RPC (`invite_worker`), not two client-driven inserts. The RPC
 * upserts by email (re-inviting an existing worker updates their existing
 * `worker_invitations` row instead of creating a duplicate) and generates
 * the invitation token itself via gen_random_uuid() — a client-generated
 * token would be a bearer-credential account-takeover risk (see 0018's own
 * header comment). `p_email` is required: 0017 made email mandatory for new
 * worker invites at the app layer.
 *
 * No WhatsApp/SMS/app delivery is wired for worker invitations yet (no
 * `send-worker-invitation` edge function exists, unlike org/project
 * invitations which do have one) — same gap mobile's team.tsx documents.
 * So after the RPC call we read back the token it generated and return a
 * copy-paste link, matching mobile's manual-share stopgap.
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

  const { data: workerId, error: rpcError } = await supabase.rpc('invite_worker', {
    p_org_id: profile.active_org_id,
    p_full_name: parsed.data.full_name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_trade: parsed.data.trade ?? null,
    p_daily_rate: parsed.data.daily_rate ?? null,
    p_channel: parsed.data.channel,
  });

  if (rpcError || !workerId) {
    return { success: false, error: "Impossible d'inviter l'ouvrier. Vérifiez vos droits." };
  }

  const { data: invitation } = await supabase
    .from('worker_invitations')
    .select('token')
    .eq('worker_id', workerId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  revalidatePath('/team');
  return {
    success: true,
    inviteLink: invitation?.token
      ? `${process.env.NEXT_PUBLIC_APP_URL}/invite/worker?token=${invitation.token}`
      : undefined,
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

/**
 * Migration 0025 — soft-delete via `soft_delete_worker` RPC, matching
 * mobile's team.tsx. The collaborator's original TeamView removed the row
 * from local React state only, with no backing database call at all — the
 * worker would reappear on next page load. Wired to the real RPC here.
 */
export async function deleteWorker(workerId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { success: false, error: emailError };

  const { error } = await supabase.rpc('soft_delete_worker', { p_worker_id: workerId });
  if (error) {
    return { success: false, error: 'Impossible de supprimer ce travailleur.' };
  }

  revalidatePath('/team');
  return { success: true };
}
