/**
 * Explicit logout: revokes the admin_sessions row (not just clearing the
 * cookie client-side) so a stolen-but-unexpired JWT can't still be used —
 * revocation is checked in lib/require-admin-session.ts against this row.
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE, verifySessionToken } from '@/lib/admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function POST() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (payload) {
    const supabase = getAdminSupabaseClient();
    await supabase
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', payload.sessionId);
  }

  cookies().delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
