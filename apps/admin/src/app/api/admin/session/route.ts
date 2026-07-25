/**
 * Returns the current admin's session context, or 401. Used by the client
 * shell to render the sidebar/topbar (admin name, role) and by the
 * impersonation banner to poll remaining time.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  return NextResponse.json(ctx);
}
