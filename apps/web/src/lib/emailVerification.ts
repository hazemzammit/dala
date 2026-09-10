import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * apps/web/src/lib/emailVerification.ts
 *
 * Gap-closure guide §2.8 — real server-side enforcement (confirmed with
 * Hazem this needs building from scratch: neither web nor mobile had an
 * existing pattern to port, despite the guide's "matching mobile's soft-
 * gate" framing — mobile's own dashboard.tsx explicitly lists this as
 * still cut too).
 *
 * Mirrors `projectStatus.ts`'s shape: one small async check, called at the
 * top of every operational write action, right after resolving the caller.
 * Read-only screens and account-recovery actions (profile edits, phone/
 * email change, password/2FA, notification prefs, account deletion,
 * feedback) are deliberately NOT gated by this — blocking those would
 * create a lockout (a user who can't verify their email must still be able
 * to fix their phone number or delete the account), and notification
 * prefs / feedback have no security reason to be blocked at all.
 */
export async function requireVerifiedEmail(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('email_verified_at')
    .eq('id', userId)
    .single();

  if (!data?.email_verified_at) {
    return 'Confirmez votre adresse e-mail avant de continuer. Vérifiez votre boîte de réception pour le lien de confirmation.';
  }

  return null;
}
