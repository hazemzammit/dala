/**
 * Doc 04 §4.3.5 — default read-only path. No confirmation, no reason,
 * no approval needed for a plain SELECT/WITH/EXPLAIN — but every query is
 * still logged (read access to cross-tenant data is itself worth an audit
 * trail, even without a destructive action attached).
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { classifySql, findSensitiveReference } from '@/lib/db-explorer/classify-sql';
import {
  ExplorerReadNotConfiguredError,
  getDbExplorerReadPool,
} from '@/lib/db-explorer/pg-client';
import { runReadOnlyQuery } from '@/lib/db-explorer/read-only-query';
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

  // /query is open to every admin role, so it must never surface credentials
  // or key material (Vault, Supabase Auth, admin credential tables).
  const sensitive = findSensitiveReference(sql);
  if (sensitive) {
    return NextResponse.json(
      {
        error: `Accès à « ${sensitive} » non autorisé depuis cet écran (données sensibles). Utilisez les écrans dédiés.`,
      },
      { status: 403 },
    );
  }

  try {
    // Enforced by Postgres (READ ONLY transaction, single statement), not by
    // the classifier above — see lib/db-explorer/read-only-query.ts.
    const result = await runReadOnlyQuery(getDbExplorerReadPool(), sql);
    await logAdminAction(ctx, 'db_explorer.read', { metadata: { sql } });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ExplorerReadNotConfiguredError) {
      // Misconfiguration, not a bad query: say so plainly (and don't run with more privilege).
      console.error('[db-explorer]', err.message);
      return NextResponse.json(
        { error: "Lecture SQL indisponible : le rôle en lecture seule n'est pas configuré." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erreur SQL inconnue.' },
      { status: 400 },
    );
  }
}
