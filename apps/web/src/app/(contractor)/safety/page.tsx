import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import { SafetyView } from './SafetyView';


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

  // ppe_checklists / risk_alerts queries removed — neither table exists in
  // this schema (see actions.ts's header comment). The original version of
  // this page would have thrown a Postgres "relation does not exist" error
  // on every load.
  const { data: incidents } = await supabase
    .from('safety_incidents')
    .select('id, description, severity, incident_type, location, photo_url, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const { data: insurances } = await supabase
    .from('org_insurances')
    .select(
      'id, provider_name, policy_number, coverage_type, expires_at, reminder_enabled, created_at',
    )
    .eq('org_id', orgId)
    .order('expires_at', { ascending: true });

  // Fix 3c — web had no incident detail view at all (list + create modal
  // only); mobile's safety.tsx already shows involved workers per
  // incident via safety_incident_workers. Fetched here (server-side,
  // batched) rather than lazily per-click, since the incident list is
  // already small and org-scoped.
  const incidentIds = (incidents ?? []).map((i) => i.id);
  const [{ data: workerLinks }, { data: workers }] = await Promise.all([
    incidentIds.length > 0
      ? supabase
          .from('safety_incident_workers')
          .select('incident_id, worker_id')
          .in('incident_id', incidentIds)
      : Promise.resolve({ data: [] as { incident_id: string; worker_id: string }[] }),
    supabase.from('workers').select('id, full_name').eq('org_id', orgId),
  ]);
  const workerNameById = Object.fromEntries((workers ?? []).map((w) => [w.id, w.full_name]));
  const workerNamesByIncidentId: Record<string, string[]> = {};
  (workerLinks ?? []).forEach((l) => {
    const name = workerNameById[l.worker_id];
    if (!name) return;
    workerNamesByIncidentId[l.incident_id] = [
      ...(workerNamesByIncidentId[l.incident_id] ?? []),
      name,
    ];
  });

  // Fix 3c — org-files is a private bucket (same one AppShell.tsx and
  // roles/page.tsx already sign against); the detail view renders the
  // incident photo, so it needs a signed URL, not the raw storage path.
  // Signed up front for all incidents, same "one Promise.all pass over
  // the whole list" convention journal/page.tsx already uses for site-log
  // photos, rather than a second round-trip per click.
  const incidentsWithSignedPhotos = await Promise.all(
    (incidents ?? []).map(async (inc) => {
      if (!inc.photo_url) return { ...inc, signed_photo_url: null };
      const { data } = await supabase.storage
        .from('org-files')
        .createSignedUrl(inc.photo_url, 3600);
      return { ...inc, signed_photo_url: data?.signedUrl ?? null };
    }),
  );

  return (
    <SafetyView
      incidents={incidentsWithSignedPhotos}
      insurances={insurances ?? []}
      workerNamesByIncidentId={workerNamesByIncidentId}
    />
  );
}
