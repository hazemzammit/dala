/**
 * Doc 04 §4.3.5 — approve or reject a pending write request. Approving
 * actually runs the SQL right here (via the same pg pool the direct-write
 * path uses) — approval IS the execution trigger, there's no separate
 * "now go run it" step.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { getDbExplorerPool } from '@/lib/db-explorer/pg-client';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function POST(request: Request, { params }: { params: { requestId: string } }) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const decision = body?.decision as 'approve' | 'reject' | undefined;
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json(
      { error: 'decision doit être "approve" ou "reject"' },
      { status: 400 },
    );
  }

  const supabase = getAdminSupabaseClient();
  const { data: reqRow } = await supabase
    .from('admin_approval_requests')
    .select('*')
    .eq('id', params.requestId)
    .maybeSingle();

  if (!reqRow) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (reqRow.status !== 'pending') {
    return NextResponse.json({ error: 'Cette demande a déjà été traitée.' }, { status: 409 });
  }
  // §4.3.5 — an admin can never approve their own request.
  if (reqRow.requested_by === ctx.admin.id) {
    return NextResponse.json(
      { error: 'Vous ne pouvez pas approuver votre propre demande.' },
      { status: 403 },
    );
  }

  if (decision === 'reject') {
    await supabase
      .from('admin_approval_requests')
      .update({
        status: 'rejected',
        approved_by: ctx.admin.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', params.requestId);

    await logAdminAction(ctx, 'db_explorer.write_rejected', {
      targetTable: 'admin_approval_requests',
      targetId: params.requestId,
    });

    return NextResponse.json({ status: 'rejected' });
  }

  // Approve — execute now.
  const pool = getDbExplorerPool();
  try {
    const result = await pool.query(reqRow.sql_statement as string);

    await supabase
      .from('admin_approval_requests')
      .update({
        status: 'executed',
        approved_by: ctx.admin.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', params.requestId);

    await logAdminAction(ctx, 'db_explorer.write_approved_and_executed', {
      targetTable: 'admin_approval_requests',
      targetId: params.requestId,
      metadata: {
        sql: reqRow.sql_statement,
        requestedBy: reqRow.requested_by,
        rowCount: result.rowCount,
      },
    });

    return NextResponse.json({ status: 'executed', rowCount: result.rowCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur SQL inconnue.' },
      { status: 400 },
    );
  }
}
