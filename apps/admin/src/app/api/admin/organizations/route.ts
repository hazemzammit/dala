/**
 * Doc 04 §4.3.3 — cross-tenant org listing. Service-role read, bypassing
 * RLS deliberately (see lib/supabase/admin-client.ts). No client-side
 * Supabase call ever queries `organizations` directly from apps/admin.
 *
 * Admin remediation Tier 4.1 — pagination. `page`/`pageSize` query params
 * (default pageSize 50, matching services-health/invocations' own
 * default from Tier 2.1), `.range()` + `{ count: 'exact' }` so the UI can
 * show "N organisations, page X/Y". member_counts and storage usage are
 * now scoped to just the current page's org ids (`.in('org_id', ...)`)
 * rather than reading the entire organization_members table and the
 * entire storage bucket's rollup on every page load — the pre-pagination
 * version had no page to scope to, so it read everything; now that there
 * is one, there's no reason to keep paying for a full scan per request.
 *
 * Admin remediation Tier 4.2 — search. `?q=` does `.ilike('name', ...)`,
 * applied before `.range()` so pagination is over the filtered set, not
 * the full table with client-side filtering on top.
 *
 * Audit fix 3b (Option B) — `?verificationPending=1` filters to
 * verification_status = 'pending', ordered oldest-request-first
 * (verification_requested_at), for the admin approval queue tab on
 * OrganizationsTable.tsx. Same query-param-driven filter shape as `q`
 * above, not a separate endpoint.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

const DEFAULT_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const verificationPending = searchParams.get('verificationPending') === '1';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = Math.min(
    200,
    Math.max(
      1,
      Number(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE,
    ),
  );
  const offset = (page - 1) * pageSize;

  const supabase = getAdminSupabaseClient();
  let query = supabase
    .from('organizations')
    .select(
      'id, name, trade_type, plan, created_at, verification_status, verification_requested_at',
      {
        count: 'exact',
      },
    )
    .order(verificationPending ? 'verification_requested_at' : 'created_at', {
      ascending: verificationPending,
    })
    .range(offset, offset + pageSize - 1);

  if (q) query = query.ilike('name', `%${q}%`);
  if (verificationPending) query = query.eq('verification_status', 'pending');

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pageOrgIds = (data ?? []).map((org) => org.id as string);

  // Member counts fetched separately (organization_members has no direct
  // FK-count shortcut without a view) — scoped to this page's orgs only.
  const { data: memberCounts } = await supabase
    .from('organization_members')
    .select('org_id')
    .in('org_id', pageOrgIds.length > 0 ? pageOrgIds : ['00000000-0000-0000-0000-000000000000']);

  const counts = new Map<string, number>();
  for (const row of memberCounts ?? []) {
    const id = row.org_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // Doc 04 §4.3.3 — "storage used" is a required column on this table.
  // Reuses admin_storage_usage_by_org() (migration 0026), the same RPC
  // the Storage Monitor route already calls. NOTE: this RPC has no
  // org_id filter parameter (checked its signature before writing this —
  // it's a flat GROUP BY over the whole storage.objects bucket with no
  // WHERE-by-org clause), so unlike member_counts above, this still reads
  // the whole bucket's rollup every page load and filters client-side. A
  // real fix would mean adding a filter param to the RPC itself — out of
  // this item's explicit scope (pagination on the two list screens, not
  // changing a shared RPC also used by Storage Monitor), so left as a
  // known remaining inefficiency rather than silently "fixed."
  const { data: usageRows } = await supabase.rpc('admin_storage_usage_by_org');
  const storageByOrg = new Map<string, number>();
  for (const row of (usageRows ?? []) as { organization_id: string; total_bytes: number }[]) {
    storageByOrg.set(row.organization_id, row.total_bytes);
  }

  const organizations = (data ?? []).map((org) => ({
    ...org,
    member_count: counts.get(org.id as string) ?? 0,
    storage_used_bytes: storageByOrg.get(org.id as string) ?? 0,
  }));

  return NextResponse.json({ organizations, page, pageSize, total: count ?? 0 });
}
