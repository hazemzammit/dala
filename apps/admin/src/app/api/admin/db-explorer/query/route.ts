/**
 * Doc 04 §4.3.5 — default read-only path. No confirmation, no reason,
 * no approval needed for a plain SELECT/WITH/EXPLAIN — but every query is
 * still logged (read access to cross-tenant data is itself worth an audit
 * trail, even without a destructive action attached).
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { classifySql } from '@/lib/db-explorer/classify-sql';
import { getDbExplorerPool } from '@/lib/db-explorer/pg-client';
import { getAdminSessionContext } from '@/lib/require-admin-session';

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sql = typeof body?.sql === 'string' ? body.sql : '';

  const classification = classifySql(sql);
  if (classification.kind !== 'read') {
    return NextResponse.json(
      {
        error:
          classification.kind === 'write'
            ? "Requête d'écriture détectée — utilisez le mode 'zone dangereuse' (POST /execute)."
            : classification.reason,
      },
      { status: 400 },
    );
  }

  const pool = getDbExplorerPool();
  try {
    const result = await pool.query(sql);
    await logAdminAction(ctx, 'db_explorer.read', { metadata: { sql } });
    return NextResponse.json({
      rows: result.rows,
      fields: result.fields.map((f: { name: string }) => f.name),
      rowCount: result.rowCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur SQL inconnue.' },
      { status: 400 },
    );
  }
}
