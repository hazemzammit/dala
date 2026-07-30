// supabase/functions/export-org-data/index.ts
//
// Phase 5 — Doc 02 §2.10 "self-service data export." Doc 01 §1.16 doesn't
// exist in this repo to specify format/scope (confirmed by reading Doc 01's
// current contents before writing this file — it stops at §1.13), so this
// is a PROPOSED minimal scope, not something pulled from spec:
//
//   - JSON or CSV of the requesting org's OWN data across the tables that
//     actually belong to it (workers, projects, dispatch_assignments,
//     attendance_records, advances, project_expenses, materials,
//     site_logs — metadata only, not the binary photo/voice attachments —
//     safety_incidents, org_insurances).
//   - Owner/manager only (this includes financial data — advances, project
//     expenses — which is a stricter bar than plain org-membership).
//   - Returned directly in the HTTP response body, not written to Storage —
//     at MVP org sizes this stays well within a normal response size, and
//     avoids adding a signed-URL-with-expiry mechanism for what's expected
//     to be an infrequent, on-demand action.
//
// NOT built here, flagged rather than silently skipped:
//   - A genuine multi-file .zip (one CSV per table) — would need a Deno zip
//     library import; CSV mode instead returns one text file with a
//     "== table_name ==" section header before each table's rows. Good
//     enough to actually use, not as polished as separate files.
//   - Any UI for scheduling a recurring export, or emailing the file — this
//     is an on-demand pull only.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';

const EXPORTABLE_TABLES = [
  'workers',
  'projects',
  'dispatch_assignments',
  'attendance_records',
  'advances',
  'project_expenses',
  'materials',
  'site_logs',
  'safety_incidents',
  'org_insurances',
] as const;

// site_logs carries Storage PATHS (Doc 01 §1.3.11 — never public/signed
// URLs at rest), not the binary files themselves, so this list intentionally
// still includes it — the export gives the row data, not the attachments.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Authentification requise.' }, 401);
    }

    const body = await req.json();
    const { org_id, format } = body ?? {};
    if (!org_id || !['csv', 'json'].includes(format)) {
      return jsonResponse({ error: 'Champs requis manquants.' }, 400);
    }

    // Caller-scoped client (anon key + forwarded JWT) — used only to
    // resolve identity and role, never to read the export data itself, so
    // this respects RLS exactly like every other authenticated request.
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) {
      return jsonResponse({ error: 'Session invalide.' }, 401);
    }

    const { data: membership } = await callerClient
      .from('organization_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || !['owner', 'manager'].includes(membership.role)) {
      // Export includes financial data (advances, project_expenses) — a
      // stricter bar than plain org-membership, matching the pattern used
      // elsewhere in this repo for financial fields (Doc 03 §3.22.2's
      // owner-only Matricule Fiscal / Numéro RC).
      return jsonResponse({ error: 'Réservé au propriétaire ou gestionnaire.' }, 403);
    }

    // Service role from here on, purely to read across all export tables in
    // one pass without N separate RLS-scoped round trips — org_id is
    // already verified above via the caller's own membership row, so this
    // is not a broader trust boundary than the check just performed.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const tables: Record<string, unknown[]> = {};
    for (const table of EXPORTABLE_TABLES) {
      const orgColumn = table === 'projects' ? 'lead_org_id' : 'org_id';
      const { data, error } = await admin.from(table).select('*').eq(orgColumn, org_id);
      if (error) {
        return jsonResponse({ error: `Échec de lecture de ${table}: ${error.message}` }, 500);
      }
      tables[table] = data ?? [];
    }

    if (format === 'json') {
      return new Response(JSON.stringify(tables, null, 2), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="dala-export.json"',
        },
      });
    }

    const csvSections = EXPORTABLE_TABLES.map((table) => toCsvSection(table, tables[table]));
    return new Response(csvSections.join('\n\n'), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="dala-export.csv"',
      },
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Erreur inconnue.' }, 500);
  }
});

function toCsvSection(tableName: string, rows: unknown[]): string {
  if (rows.length === 0) return `== ${tableName} ==\n(aucune ligne)`;

  const columns = Object.keys(rows[0] as Record<string, unknown>);
  const header = columns.join(',');
  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvValue((row as Record<string, unknown>)[col])).join(','),
  );
  return `== ${tableName} ==\n${header}\n${lines.join('\n')}`;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
