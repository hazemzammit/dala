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
//
// Admin-remediation-phase addition: apps/admin's Organizations screen
// (Doc 04 §4.3.3 "Export as JSON") needed to call this same function, but
// a platform admin is never an owner/manager of the target org — the
// owner/manager membership check below would 403 every admin-initiated
// call. Rather than duplicate the export logic in a second function, this
// now recognizes a second, distinct caller shape: a request whose
// Authorization header carries the PROJECT's own service-role key exactly
// (not a forwarded user JWT) is treated as a trusted internal call from
// apps/admin's own server-side route handler — which already re-verified
// the calling platform admin's session and role, and already audit-logs
// the export, before ever reaching this function. This is the same trust
// boundary every other admin-app→Edge-Function call in this repo already
// crosses (apps/admin holds the service-role key server-side only, never
// exposed to a browser) — not a new or broader one. A service-role call
// skips the owner/manager membership check (a platform admin has
// cross-tenant access by design, Doc 04 §4.3 intro) but still runs the
// same free-tier gate below.
//
// API-keys update: the trusted-call check compares against the runtime's own
// SUPABASE_SERVICE_ROLE_KEY env var, which (local CLI and CI runtime) holds
// the legacy JWT — while apps/admin's .env.local (written by CI, or set up
// against a CLI configured with new-format API keys) carries the `sb_secret_`
// service key. Rather than assuming both are interchangeable, a presented
// sb_secret_ key is accepted only after it validates against Auth's admin
// endpoint — which answers 200 for a service-level key and 401 for every
// other credential shape (anon key, user JWT, publishable key) — so the
// trust boundary stays exactly "service-level key or nothing".
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';
import { withInvocationLog } from '../_shared/logInvocation.ts';

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

Deno.serve(
  withInvocationLog('export-org-data', async (req, ctx) => {
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
      ctx.orgId = org_id;

      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      // Exact legacy-JWT match, unchanged. Plus: a new-format `sb_secret_`
      // service key can't be compared by value (the runtime env above still
      // holds the legacy JWT), so validate it instead — see isValidSecretKey.
      // Anon keys / user JWTs / publishable keys fail both branches and fall
      // through to the unchanged membership check below.
      const presented = authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length)
        : null;
      const isTrustedAdminCall =
        authHeader === `Bearer ${serviceRoleKey}` ||
        (presented?.startsWith('sb_secret_') === true && (await isValidSecretKey(presented)));

      const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

      if (!isTrustedAdminCall) {
        // Caller-scoped client (anon key + forwarded JWT) — used only to
        // resolve identity and role, never to read the export data itself,
        // so this respects RLS exactly like every other authenticated
        // request from apps/web.
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
      }

      // 0044 — no reports/export on the free tier. For a normal caller this
      // reused the RLS-scoped callerClient; a trusted admin call has no
      // callerClient (no forwarded user JWT to scope one to), so it reads
      // the same single column via the already-created admin client instead
      // — no broader read than the check itself needs either way.
      const { data: org } = await admin
        .from('organizations')
        .select('subscription_status')
        .eq('id', org_id)
        .maybeSingle();
      if (org?.subscription_status === 'past_due') {
        return jsonResponse(
          { error: "L'export de données n'est pas disponible sur l'offre gratuite." },
          403,
        );
      }

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
  }),
);

// Validate a new-format `sb_secret_` API key. It isn't a JWT, so there is
// nothing to decode or signature-check locally — instead probe Auth's admin
// endpoint with it: that endpoint requires a service-level key and answers
// 401 for every other credential shape (anon key, user JWT, publishable
// key), so a 2xx here is proof enough that the presented key is a service
// key the local Supabase itself issued/accepts.
async function isValidSecretKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')!}/auth/v1/admin/users?per_page=1`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
