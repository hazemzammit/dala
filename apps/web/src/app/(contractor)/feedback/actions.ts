'use server';

import { submitFeedbackSchema, type SubmitFeedbackInput } from '@dala/validation';

import { createClient } from '@/lib/supabase/server';

type ActionResult = { success: true } | { success: false; error: string };

/**
 * apps/web/src/app/(contractor)/feedback/actions.ts
 *
 * Gap-closure guide §1.6 — mirrors mobile's insert shape exactly:
 * org_id from the user's first organization_members row (not required —
 * `feedback.org_id` is nullable, see migration 0074), submitted_by from
 * the session, platform hardcoded to 'web' (mobile sends `Platform.OS`;
 * there's no equivalent runtime check needed here), app_version from
 * this app's own package.json version (no existing app-version constant
 * on web — mobile's `currentBuild()` reads Expo's native build metadata,
 * which has no web equivalent, so this reads the simplest available
 * substitute instead).
 */
export async function submitFeedback(input: SubmitFeedbackInput): Promise<ActionResult> {
  const parsed = submitFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Session expirée, reconnectez-vous.' };

  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('feedback').insert({
    org_id: membership?.org_id ?? null,
    submitted_by: user.id,
    category: parsed.data.category,
    message: parsed.data.message,
    platform: 'web',
    app_version: process.env.npm_package_version ?? null,
  });

  if (error) return { success: false, error: "Impossible d'envoyer le message." };

  return { success: true };
}
