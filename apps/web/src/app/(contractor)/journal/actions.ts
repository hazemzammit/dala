'use server';

import { createSiteLogSchema, type CreateSiteLogInput } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export type ActionResult = { success: true } | { success: false; error: string };

export async function createSiteLog(input: CreateSiteLogInput): Promise<ActionResult> {
  const parsed = createSiteLogSchema.safeParse(input);
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

  const { error } = await supabase.from('site_logs').insert({
    org_id: profile.active_org_id,
    project_id: parsed.data.project_id,
    photo_url: parsed.data.photo_path,
    caption: parsed.data.caption || null,
    logged_by: user.id,
  });

  if (error) {
    console.error('createSiteLog error:', error);
    return { success: false, error: "Impossible d'enregistrer le journal de chantier." };
  }

  revalidatePath('/journal');
  return { success: true };
}
