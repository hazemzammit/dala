/**
 * apps/admin/src/app/api/admin/organizations/bulk/route.ts
 *
 * Doc 04 §4.3.3 — bulk actions, admin remediation Tier 4.3. Per the plan's
 * own guidance, this starts with the two safest bulk actions only —
 * change_plan and export — and deliberately does NOT include bulk suspend
 * or bulk soft-delete. Those are each a much bigger blast radius per
 * click than their single-org equivalents, and the plan explicitly flags
 * the typed-confirmation trade-off ("type CONFIRM to suspend N orgs"
 * vs. each org's own exact name) as a judgment call to make deliberately
 * rather than ship by default — left out of this pass rather than decided
 * silently in either direction.
 *
 * `POST { action, targetIds }` — loops server-side, reusing the exact
 * same per-org logic the single-org route uses (changeOrgPlan from
 * lib/organizations/actions.ts for change_plan; the same export-org-data
 * Edge Function call the single-org export route makes, for export).
 * Audit-logs ONE row per target, not one combined row — the plan's own
 * instruction, so the trail stays exactly as granular as single actions
 * (an admin reviewing audit_log later sees N org.change_plan rows, not a
 * single ambiguous "bulk action" row that doesn't say which orgs).
 */
import { NextResponse } from 'next/server';

import { logAdminAction } from '@/lib/audit-log';
import { changeOrgPlan } from '@/lib/organizations/actions';
import { getAdminSessionContext } from '@/lib/require-admin-session';
import { requireRole } from '@/lib/require-role';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

type BulkAction = 'change_plan' | 'export';
const MAX_TARGETS = 100; // sanity cap — bulk-selecting the entire orgs
// table isn't a real use case this needs to support, and it bounds how
// long a single request can run (each target is a sequential await, not
// parallelized — see the loop below for why).

export async function POST(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = body?.action as BulkAction | undefined;
  const targetIds = Array.isArray(body?.targetIds) ? (body.targetIds as string[]) : [];
  const plan = typeof body?.plan === 'string' ? body.plan : null;

  // Same role split as the single-org route: change_plan is a mutation
  // (super_admin + admin), export is read-only (any authenticated admin,
  // Support included — Doc 04 §4.3 intro's "Support: read-only everywhere").
  const roleError = requireRole(
    ctx,
    action === 'export' ? ['super_admin', 'admin', 'support'] : ['super_admin', 'admin'],
  );
  if (roleError) return roleError;

  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'Aucune organisation sélectionnée.' }, { status: 400 });
  }
  if (targetIds.length > MAX_TARGETS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_TARGETS} organisations par action groupée.` },
      { status: 400 },
    );
  }
  if (action === 'change_plan' && !plan) {
    return NextResponse.json({ error: 'plan requis' }, { status: 400 });
  }
  if (action !== 'change_plan' && action !== 'export') {
    return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  }

  const supabase = getAdminSupabaseClient();

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .in('id', targetIds);
  const orgsById = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]));

  const results: { orgId: string; ok: boolean; error?: string }[] = [];

  // Sequential, not Promise.all — export in particular makes a real
  // outbound call per org (the export-org-data Edge Function), and
  // MAX_TARGETS=100 concurrent Edge Function invocations from one request
  // risks tripping rate limits that don't apply to one-at-a-time admin
  // clicks. Bulk actions are inherently a "give it a few seconds" UX, not
  // an instant one.
  const exportedData: { orgId: string; orgName: string; data: unknown }[] = [];
  for (const orgId of targetIds) {
    const orgName = orgsById.get(orgId);
    if (!orgName) {
      results.push({ orgId, ok: false, error: 'Organisation introuvable.' });
      continue;
    }

    try {
      if (action === 'change_plan') {
        await changeOrgPlan(supabase, orgId, plan!);
        await logAdminAction(ctx, 'org.change_plan', {
          targetTable: 'organizations',
          targetId: orgId,
          orgId,
          metadata: { plan, bulk: true },
        });
      } else {
        // export — same Edge Function call the single-org export route
        // makes (api/admin/organizations/[orgId]/export/route.ts), JSON
        // format only for bulk (a combined multi-org file has one clear
        // JSON shape — {orgId, orgName, data}[] — but no equally clean
        // way to concatenate N independent per-org CSVs into one file
        // without inventing a section format the single-org CSV export
        // doesn't have; CSV stays available per-org individually).
        const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!projectUrl || !serviceRoleKey) throw new Error('Configuration Supabase manquante.');

        const functionRes = await fetch(`${projectUrl}/functions/v1/export-org-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({ org_id: orgId, format: 'json' }),
        });
        if (!functionRes.ok) {
          const errBody = await functionRes.json().catch(() => ({ error: 'Erreur inconnue.' }));
          throw new Error(errBody.error ?? "Échec de l'export.");
        }
        const data = await functionRes.json();
        exportedData.push({ orgId, orgName, data });

        await logAdminAction(ctx, 'org.export', {
          targetTable: 'organizations',
          targetId: orgId,
          orgId,
          metadata: { format: 'json', bulk: true },
        });
      }
      results.push({ orgId, ok: true });
    } catch (err) {
      results.push({
        orgId,
        ok: false,
        error: err instanceof Error ? err.message : 'Erreur inconnue.',
      });
    }
  }

  const failures = results.filter((r) => !r.ok);

  if (action === 'export') {
    // Returned inline as JSON (not a file download like the single-org
    // route) — a bulk export result is naturally multi-org, so there's no
    // single sensible filename/Content-Disposition the way one org's
    // export has. The admin UI is responsible for offering this as a
    // downloadable file client-side if desired.
    return NextResponse.json({ results, exports: exportedData, failureCount: failures.length });
  }

  return NextResponse.json({ results, failureCount: failures.length });
}
