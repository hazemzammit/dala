import type { EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Doc 01 §1.3.3 step 5 (signup confirmation) and §1.3.7 step 4 (recovery).
 *
 * Both the `sign-up` and `forgot-password` Edge Functions build their
 * emailed links to point here with `token_hash` + `type` + `next`, rather
 * than using Supabase's raw `action_link` — this is the current documented
 * pattern (supabase.com/docs/guides/auth/server-side/nextjs) and is what
 * lets `supabase.auth.verifyOtp()` set real session cookies via the SSR
 * server client, so the user lands on `next` already logged in.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const rawNext = searchParams.get('next');
  const next = rawNext?.startsWith('/') ? rawNext : '/dashboard';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      redirect(next);
    }

    redirect(`/auth/error?message=${encodeURIComponent(error.message)}`);
  }

  redirect('/auth/error');
}
