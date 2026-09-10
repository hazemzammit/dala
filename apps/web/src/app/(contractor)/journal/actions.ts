'use server';

import { submitSiteLogSchema, type SubmitSiteLogInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { checkProjectIsWritable } from '@/lib/projectStatus';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { success: true } | { success: false; error: string };

/**
 * FLAGGED FOR HAZEM — rewritten from the collaborator's original version,
 * which imported a `createSiteLogSchema` that doesn't exist (the real name
 * is `submitSiteLogSchema`, fieldOps.ts) and did a plain `.insert()` on
 * `site_logs`. Migration 0069's own header comment states this table has
 * exactly ONE write path everywhere else in the app —
 * `submit_site_log_entry()` — specifically because it's append-only and the
 * RPC handles idempotency-key dedup (a retried/double-submitted entry
 * doesn't create a duplicate row) plus a "no worker row -> fall back to
 * org owner/manager on the target project" permission check a raw insert
 * has no equivalent for. A raw insert wouldn't have been blocked by RLS
 * (site_logs_insert_member is is_org_member-gated, not RPC-only), so this
 * wouldn't have failed loudly — it would have silently skipped idempotency
 * protection on every web-created journal entry.
 */
export async function createSiteLog(
  input: SubmitSiteLogInput & { caption?: string },
): Promise<ActionResult> {
  const { caption, ...rest } = input;
  const parsed = submitSiteLogSchema.safeParse(rest);
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
  if (profile?.active_org_id) {
    const projectError = await checkProjectIsWritable(
      supabase,
      parsed.data.project_id,
      profile.active_org_id,
    );
    if (projectError) return { success: false, error: projectError };
  }

  const { error } = await supabase.rpc('submit_site_log_entry', {
    p_project_id: parsed.data.project_id,
    p_photo_url: parsed.data.photo_url ?? null,
    p_voice_note_url: parsed.data.voice_note_url ?? null,
    p_note_text: parsed.data.note_text ?? null,
    p_thumbnail_url: parsed.data.thumbnail_url ?? null,
    p_location_lat: parsed.data.location_lat ?? null,
    p_location_lng: parsed.data.location_lng ?? null,
    p_idempotency_key: parsed.data.idempotency_key,
    p_caption: caption ?? null,
  });

  if (error) {
    console.error('createSiteLog error:', error);
    return { success: false, error: "Impossible d'enregistrer le journal de chantier." };
  }

  revalidatePath('/journal');
  return { success: true };
}
