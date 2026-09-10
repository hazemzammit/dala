'use server';

import { changePhoneSchema, confirmPhoneChangeSchema, updateProfileSchema } from '@dala/validation';
import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Session expirée, reconnectez-vous.' };
  return { ok: true as const, supabase, userId: user.id };
}

/**
 * apps/web/src/app/(contractor)/settings/account/actions.ts
 *
 * Gap-closure guide §1.3 — porting mobile's ProfileScreen.tsx logic
 * (contractor branch only). Every RPC/table here matches mobile exactly:
 * `dismiss_profile_checklist`, `request_phone_change`,
 * `confirm_phone_change`, direct `profiles` updates for name/avatar/
 * emergency contact (same `profiles_update_own`, id = auth.uid() RLS row
 * policy mobile relies on — no role distinction, so a plain `.update()`
 * is correct here, unlike organizations' column-level split).
 *
 * Email change is NOT here: `supabase.auth.updateUser({ email })` is a
 * Supabase Auth SDK call tied to the current browser session/cookies, not
 * a table write — it has to run through the browser client directly in
 * AccountForm.tsx, exactly like mobile calls it directly rather than
 * through a server action.
 */
export async function updateProfileName(fullName: string): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({ full_name: fullName.trim() });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Nom invalide.' };
  }
  const ctx = await requireUser();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name })
    .eq('id', ctx.userId);
  if (error) return { success: false, error: 'Impossible de mettre à jour le nom.' };

  revalidatePath('/settings/account');
  return { success: true };
}

export async function updateEmergencyContact(input: {
  name: string;
  phone: string;
}): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({
    emergency_contact_name: input.name.trim() || undefined,
    emergency_contact_phone: input.phone.trim() || undefined,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }
  const ctx = await requireUser();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from('profiles')
    .update({
      emergency_contact_name: input.name.trim() || null,
      emergency_contact_phone: input.phone.trim() || null,
    })
    .eq('id', ctx.userId);
  if (error) return { success: false, error: "Impossible d'enregistrer le contact d'urgence." };

  revalidatePath('/settings/account');
  return { success: true };
}

export async function updateAvatarPath(path: string): Promise<ActionResult> {
  const parsed = updateProfileSchema.safeParse({ avatar_url: path });
  if (!parsed.success) {
    return { success: false, error: 'Chemin de fichier invalide.' };
  }
  const ctx = await requireUser();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ avatar_url: parsed.data.avatar_url })
    .eq('id', ctx.userId);
  if (error) return { success: false, error: "Impossible de mettre à jour l'avatar." };

  revalidatePath('/settings/account');
  return { success: true };
}

export async function dismissProfileChecklist(dismissed: boolean): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const { error } = await ctx.supabase.rpc('dismiss_profile_checklist', {
    p_dismissed: dismissed,
  });
  if (error) return { success: false, error: 'Action impossible.' };

  revalidatePath('/settings/account');
  return { success: true };
}

export async function requestPhoneChange(newPhone: string): Promise<ActionResult> {
  const parsed = changePhoneSchema.safeParse({ new_phone: newPhone.trim() });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Numéro invalide.' };
  }
  const ctx = await requireUser();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const { error } = await ctx.supabase.rpc('request_phone_change', {
    p_new_phone: parsed.data.new_phone,
  });
  if (error) return { success: false, error: "Impossible d'envoyer le code. Réessayez." };

  return { success: true };
}

export async function confirmPhoneChange(code: string): Promise<ActionResult> {
  const parsed = confirmPhoneChangeSchema.safeParse({ code: code.trim() });
  if (!parsed.success) {
    return { success: false, error: 'Le code doit contenir 6 chiffres.' };
  }
  const ctx = await requireUser();
  if (!ctx.ok) return { success: false, error: ctx.error };

  const { error } = await ctx.supabase.rpc('confirm_phone_change', {
    p_code: parsed.data.code,
  });
  if (error) {
    return {
      success: false,
      error: error.message.includes('expiré') ? 'Ce code a expiré.' : 'Code incorrect.',
    };
  }

  revalidatePath('/settings/account');
  return { success: true };
}
