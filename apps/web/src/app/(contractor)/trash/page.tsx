import type { TrashItem } from '@dala/shared-types';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { TrashView } from './TrashView';

import { createClient } from '@/lib/supabase/server';

/**
 * apps/web/src/app/(contractor)/trash/page.tsx
 *
 * Gap-closure guide §1.1 — web equivalent of mobile's trash.tsx. Same four
 * entity types (project/worker/vehicle/site_log), same merge-and-sort
 * shape as mobile's `load()`.
 *
 * site_logs org-scoping: mobile's own comment says site_logs has no direct
 * org_id column and scopes via `project_id in (org's project ids)`. Re-
 * checking migration 0008 here shows site_logs DOES have a direct, non-null
 * org_id column, and its SELECT RLS policy (`site_logs_select_member`)
 * filters on that same org_id — so a direct `.eq('org_id', orgId)` is both
 * simpler and correct. Flagged for Hazem: this is a case where the guide
 * (and mobile's own stale comment) doesn't match the actual schema. Using
 * the direct filter here rather than mobile's two-step project_id join.
 */
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) redirect('/create-organization');

  const orgId = profile.active_org_id;

  const [
    { data: deletedProjects },
    { data: deletedWorkers },
    { data: deletedVehicles },
    { data: deletedLogs },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, deleted_at')
      .eq('lead_org_id', orgId)
      .not('deleted_at', 'is', null),
    supabase
      .from('workers')
      .select('id, full_name, deleted_at')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null),
    supabase
      .from('vehicles')
      .select('id, name, deleted_at')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null),
    supabase
      .from('site_logs')
      .select('id, caption, note_text, deleted_at')
      .eq('org_id', orgId)
      .not('deleted_at', 'is', null),
  ]);

  const items: TrashItem[] = [
    ...(deletedProjects ?? []).map((p) => ({
      entity_type: 'project' as const,
      id: p.id,
      label: p.name,
      deleted_at: p.deleted_at as string,
    })),
    ...(deletedWorkers ?? []).map((w) => ({
      entity_type: 'worker' as const,
      id: w.id,
      label: w.full_name,
      deleted_at: w.deleted_at as string,
    })),
    ...(deletedVehicles ?? []).map((v) => ({
      entity_type: 'vehicle' as const,
      id: v.id,
      label: v.name,
      deleted_at: v.deleted_at as string,
    })),
    ...(deletedLogs ?? []).map((l) => ({
      entity_type: 'site_log' as const,
      id: l.id,
      label: (l.caption || l.note_text || 'Entrée sans légende').slice(0, 60),
      deleted_at: l.deleted_at as string,
    })),
  ].sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : -1));

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
        <TrashView items={items} />
      </Suspense>
    </div>
  );
}
