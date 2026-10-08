import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { SecurityView } from './SecurityView';


/**
 * apps/web/src/app/(contractor)/settings/security/page.tsx
 *
 * Gap-closure guide §1.3 — web equivalent of mobile's security-settings.tsx
 * (password change + real TOTP 2FA). Migration 0029's header comment read
 * in full before building this: native Supabase Auth MFA
 * (auth.mfa.enroll/challenge/verify/unenroll) was chosen over mirroring
 * Platform Admin's plain-text `totp_secret` column specifically because a
 * server-issued `aal` (authenticator assurance level) claim is enforceable
 * server-side in a way a client-checked plain-text column isn't — a
 * modified client can't fake having verified. Platform Admin's TOTP is a
 * separate, legacy mechanism (0009/0021/0023), not touched here.
 *
 * Everything on this screen — password change, MFA enroll/challenge/
 * verify/unenroll, the two recovery-code RPCs — is a Supabase Auth SDK
 * call or an RPC tied to the current browser session, so it all runs
 * client-side in SecurityView.tsx, matching mobile's architecture exactly
 * (no server action wraps any of it, same reasoning as the email-change
 * flow in settings/account). This page component is just the auth gate.
 *
 * No biometric-lock section here (mobile's Phase 12 §6.6 addition) — that
 * feature is device-local (SecureStore) and doesn't have a web analogue
 * that makes sense; not silently dropped, just genuinely mobile-only.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <SecurityView userEmail={user.email ?? ''} />
    </div>
  );
}
