/**
 * Doc 04 §4.3.3 — cross-tenant org listing. Service-role read, bypassing
 * RLS deliberately (see lib/supabase/admin-client.ts). No client-side
 * Supabase call ever queries `organizations` directly from apps/admin.
 */
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, trade_type, plan, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Member counts fetched separately (organization_members has no direct
  // FK-count shortcut without a view) — kept as a simple N+1-avoiding
  // group-by rather than a per-row query.
  const { data: memberCounts } = await supabase.from('organization_members').select('org_id');

  const counts = new Map<string, number>();
  for (const row of memberCounts ?? []) {
    const id = row.org_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // Doc 04 §4.3.3 — "storage used" is a required column on this table.
  // Reuses admin_storage_usage_by_org() (migration 0026), the same RPC
  // the Storage Monitor route already calls — no duplicated aggregation
  // logic, just a second caller of the same read-only function.
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

  return NextResponse.json({ organizations });
}
