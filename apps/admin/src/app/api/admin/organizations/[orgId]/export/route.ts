/**
 * Doc 04 §4.3.3 — "Export as JSON" (data portability). Wiring gap, not new
 * backend work at the Edge Function level: `export-org-data` (built in
 * mobile's Phase 5) already does the real export, but its auth model only
 * ever accepted a forwarded owner/manager JWT. It was extended this phase
 * to also recognize a call whose Authorization header carries the
 * project's own service-role key as a trusted internal call (see that
 * function's header for the full reasoning) — this route is the one
 * caller expected to use that path.
 *
 * Read-only action (a data export doesn't mutate anything) — Doc 04 §4.3
 * intro's "Support: read-only everywhere" already covers this, so no
 * requireRole() gate beyond authentication, matching every other
 * read/GET route in this app.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET(request: Request, { params }: { params: { orgId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') === 'csv' ? 'csv' : 'json';

  const supabase = getAdminSupabaseClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', params.orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!projectUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Configuration Supabase manquante.' }, { status: 500 });
  }

  const functionRes = await fetch(`${projectUrl}/functions/v1/export-org-data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Sending the service-role key itself (not a user JWT) is exactly
      // the trusted-admin-call shape export-org-data's header describes —
      // this route already re-verified the calling admin's session above,
      // so this is the same trust boundary every other admin-app→Edge-
      // Function call in this repo crosses, not a broader one.
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ org_id: params.orgId, format }),
  });

  if (!functionRes.ok) {
    const errBody = await functionRes.json().catch(() => ({ error: 'Erreur inconnue.' }));
    return NextResponse.json(
      { error: errBody.error ?? 'Échec de l\u2019export.' },
      { status: functionRes.status },
    );
  }

  await logAdminAction(ctx, 'org.export', {
    targetTable: 'organizations',
    targetId: org.id as string,
    metadata: { format },
  });

  const contentType = format === 'csv' ? 'text/csv' : 'application/json';
  const filename = `dala-export-${org.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${format}`;
  const body = await functionRes.arrayBuffer();

  return new NextResponse(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
