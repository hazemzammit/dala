/**
 * Doc 04 §4.3.5 — write path (INSERT/UPDATE/DELETE only, see classify-sql).
 * Requires: danger-zone confirmation, a reason (audit-logged), and — only
 * when the team has 2+ admins — a second admin's approval before the SQL
 * actually runs. A lone admin's write executes immediately (there's no one
 * to approve it), still with the reason mandatory and still audit-logged.
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { classifySql } from '@/lib/db-explorer/classify-sql';
import { getDbExplorerPool } from '@/lib/db-explorer/pg-client';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Doc 04 §4.3 intro — raw-SQL writes are Super-Admin-only, full stop
  // ("Admin (everything except (...) raw SQL"). Support and Admin both
  // still get the read-only /query path (no gate there — see that route).
  const roleError = requireRole(ctx, ['super_admin']);
  if (roleError) return roleError;

  const body = await request.json().catch(() => null);
  const sql = typeof body?.sql === 'string' ? body.sql : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  const dangerZoneConfirmed = Boolean(body?.dangerZoneConfirmed);

  const classification = classifySql(sql);
  if (classification.kind !== 'write') {
    return NextResponse.json(
      {
        error:
          classification.kind === 'read'
            ? 'Requête en lecture seule — utilisez /query, pas /execute.'
            : classification.reason,
      },
      { status: 400 },
    );
  }

  if (!dangerZoneConfirmed) {
    return NextResponse.json(
      { error: 'Confirmation de la zone dangereuse requise.' },
      { status: 400 },
    );
  }
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "Un motif d'au moins 10 caractères est requis." },
      { status: 400 },
    );
  }

  const supabase = getAdminSupabaseClient();
  const { count: adminCount } = await supabase
    .from('platform_admins')
    .select('*', { count: 'exact', head: true });

  if ((adminCount ?? 0) >= 2) {
    // §4.3.5 — a second admin must approve before this runs at all. Store
    // the request; do NOT execute yet.
    const { data: approvalRequest, error } = await supabase
      .from('admin_approval_requests')
      .insert({ requested_by: ctx.admin.id, sql_statement: sql, reason })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logAdminAction(ctx, 'db_explorer.write_requested', {
      targetTable: 'admin_approval_requests',
      targetId: approvalRequest.id,
      metadata: { sql, reason },
    });

    return NextResponse.json({ status: 'pending_approval', approvalRequest });
  }

  // Lone admin — nothing to approve, execute directly.
  const pool = getDbExplorerPool();
  try {
    const result = await pool.query(sql);
    await logAdminAction(ctx, 'db_explorer.write_executed', {
      metadata: { sql, reason, rowCount: result.rowCount },
    });
    return NextResponse.json({ status: 'executed', rowCount: result.rowCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur SQL inconnue.' },
      { status: 400 },
    );
  }
}
