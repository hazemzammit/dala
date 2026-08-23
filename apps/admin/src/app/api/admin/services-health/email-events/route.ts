/**
 * Doc 04 §4.3.9 — email deliverability visibility, admin remediation
 * Tier 4.7. Read-only, any authenticated admin role (Doc 04 §4.3 intro's
 * "Support: read-only everywhere"). Bounces and complaints only, per the
 * plan — delivered/opened/clicked events are logged to the table (for
 * completeness / a future use) but deliberately not surfaced here:
 * "those are the actionable ones (delivered events are just noise at
 * this scale)."
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const RESULTS_LIMIT = 100;

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('email_delivery_events')
    .select('id, resend_email_id, event_type, recipient, bounce_type, bounce_message, received_at')
    .in('event_type', ['email.bounced', 'email.complained'])
    .order('received_at', { ascending: false })
    .limit(RESULTS_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
