/**
 * Doc 06 §6.3 — Storage Monitor.
 *
 * Real per-org usage, computed on-demand from storage.objects via
 * admin_storage_usage_by_org() (migration 0026) — NOT a maintained
 * `organizations.storage_used_mb` counter, because no such column exists
 * in this schema. Doc 03 §3.7 describes one, but no migration or
 * upload-confirm endpoint ever implemented it; apps/mobile's storage.ts
 * uploads straight to Supabase Storage with no callback into Postgres.
 *
 * Overage flagging (added this session): Doc 00 §0.3 item 7 defines the
 * concrete free-tier policy — 800MB banner+email, 950MB (95%) queued-
 * upload warning, 1GB read-only + upgrade prompt (Doc 03 §3.7). This is
 * ONLY a defined limit for the 'free' plan; nothing in Doc 00/03 states a
 * numeric limit for 'pro'/'business' — those are shown as "no limit
 * defined" rather than silently reusing the free-tier number, which would
 * be inventing a policy for plans the spec doesn't cover.
 */
import type { OrgStorageUsage } from '@dala/shared-types';
import { NextResponse } from 'next/server';

import { getAdminSessionContext } from '@/lib/require-admin-session';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

// Doc 00 §0.3 item 7 — free-tier thresholds, in bytes.
const FREE_TIER_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1GB
const FREE_TIER_WARNING_BYTES = 0.8 * 1024 * 1024 * 1024; // 800MB
const FREE_TIER_CRITICAL_BYTES = 0.95 * 1024 * 1024 * 1024; // 950MB (95%)

function overageStatusFor(
  plan: string | null,
  totalBytes: number,
): OrgStorageUsage['overage_status'] {
  if (plan !== 'free') return 'no_limit_defined';
  if (totalBytes >= FREE_TIER_LIMIT_BYTES) return 'over_limit';
  if (totalBytes >= FREE_TIER_CRITICAL_BYTES) return 'critical';
  if (totalBytes >= FREE_TIER_WARNING_BYTES) return 'warning';
  return 'ok';
}

export async function GET() {
  const ctx = await getAdminSessionContext();
  if (!ctx) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const supabase = getAdminSupabaseClient();

  const [{ data: usage, error: usageError }, { data: orgs, error: orgsError }] = await Promise.all([
    supabase.rpc('admin_storage_usage_by_org'),
    supabase.from('organizations').select('id, name, plan, suspended_at, deleted_at'),
  ]);

  if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 });
  if (orgsError) return NextResponse.json({ error: orgsError.message }, { status: 500 });

  const orgById = new Map((orgs ?? []).map((o) => [o.id, o]));

  const rows: OrgStorageUsage[] = (
    (usage ?? []) as { organization_id: string; file_count: number; total_bytes: number }[]
  ).map((row) => {
    const org = orgById.get(row.organization_id);
    return {
      organization_id: row.organization_id,
      organization_name: org?.name ?? '(org not found — orphaned files?)',
      plan: org?.plan ?? null,
      suspended_at: org?.suspended_at ?? null,
      deleted_at: org?.deleted_at ?? null,
      file_count: row.file_count,
      total_bytes: row.total_bytes,
      overage_status: overageStatusFor(org?.plan ?? null, row.total_bytes),
    };
  });

  // Orgs with zero files never appear in the RPC's GROUP BY output at all —
  // surface them too, at 0 bytes, so the table reads as "every org" rather
  // than "every org that happens to have uploaded something".
  const seenOrgIds = new Set(rows.map((r) => r.organization_id));
  for (const org of orgs ?? []) {
    if (!seenOrgIds.has(org.id)) {
      rows.push({
        organization_id: org.id,
        organization_name: org.name,
        plan: org.plan,
        suspended_at: org.suspended_at,
        deleted_at: org.deleted_at,
        file_count: 0,
        total_bytes: 0,
        overage_status: overageStatusFor(org.plan, 0),
      });
    }
  }

  rows.sort((a, b) => b.total_bytes - a.total_bytes);

  const totalBytes = rows.reduce((sum, r) => sum + r.total_bytes, 0);
  const totalFiles = rows.reduce((sum, r) => sum + r.file_count, 0);

  return NextResponse.json({ rows, totals: { totalBytes, totalFiles, orgCount: rows.length } });
}
