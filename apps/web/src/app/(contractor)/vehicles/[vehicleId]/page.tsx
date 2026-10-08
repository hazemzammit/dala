import type { VehicleDocument, VehicleMaintenanceLogEntry } from '@dala/shared-types';
import { notFound, redirect } from 'next/navigation';

import { canSeeMoney, getOrgRole } from '@/lib/orgRole';
import { createClient } from '@/lib/supabase/server';

import { VehicleDetail } from './VehicleDetail';


/**
 * Vehicle detail page (web consistency plan §2.9) — the addressable successor
 * of VehiclesView's inline detail card. Same auth/org resolution as the
 * vehicles list page; the by-id fetch is org-scoped so a foreign id 404s.
 *
 * Field-coverage pass — three things added:
 * 1. `photo_url` (migration 0070) is now resolved to a signed URL, same
 *    convention as projects/team.
 * 2. `vehicle_maintenance_log` (migration 0073) is queried for real —
 *    resolves the "FLAGGED FOR HAZEM (Step 12b)" placeholders that used
 *    to sit in VehicleDetail.tsx, but only the part of that flag that
 *    was actually unambiguous: showing the single latest log entry's own
 *    cost/description verbatim needs no "what does 'current' mean"
 *    product decision — that's a different question from the vehicle
 *    LIST's now-removed fabricated columns, which would have needed an
 *    aggregate (sum? average? over what window?) rather than one row.
 * 3. `vehicle_documents` (migration 0073) is queried in full and deduped
 *    to the latest row per `document_type` — same client-side reduce
 *    mobile's vehicle/[id].tsx already uses (Supabase-js has no direct
 *    DISTINCT ON helper), plus the same signed-URL-map step for
 *    `document_url` (a private storage path, same as everywhere else).
 */
export default async function Page(props: { params: Promise<{ vehicleId: string }> }) {
  const params = await props.params;
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
  const showMoney = canSeeMoney(await getOrgRole(supabase, profile.active_org_id, user.id));

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id, org_id, name, plate, capacity, status, version, photo_url, deleted_at, created_at')
    .eq('id', params.vehicleId)
    .eq('org_id', profile.active_org_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!vehicle) notFound();

  let signedPhotoUrl: string | null = null;
  if (vehicle.photo_url) {
    const { data } = await supabase.storage
      .from('org-files')
      .createSignedUrl(vehicle.photo_url, 3600);
    signedPhotoUrl = data?.signedUrl ?? null;
  }

  const [{ data: maintenanceLog }, { data: documentRows }] = await Promise.all([
    supabase
      .from('vehicle_maintenance_log')
      .select('id, org_id, vehicle_id, log_date, description, cost, logged_by, created_at')
      .eq('vehicle_id', vehicle.id)
      .order('log_date', { ascending: false }),
    supabase
      .from('vehicle_documents')
      .select('id, org_id, vehicle_id, document_type, document_url, expires_at, recorded_by, created_at')
      .eq('vehicle_id', vehicle.id)
      .order('created_at', { ascending: false }),
  ]);

  const documents = (documentRows ?? []) as VehicleDocument[];
  const byType = new Map<string, VehicleDocument>();
  for (const doc of documents) {
    if (!byType.has(doc.document_type)) byType.set(doc.document_type, doc);
  }
  const currentDocuments = Array.from(byType.values());

  const documentSignedUrls = await Promise.all(
    currentDocuments.map(async (doc) => {
      if (!doc.document_url) return [doc.id, null] as const;
      const { data } = await supabase.storage
        .from('org-files')
        .createSignedUrl(doc.document_url, 3600);
      return [doc.id, data?.signedUrl ?? null] as const;
    }),
  );
  const signedUrlByDocId = Object.fromEntries(documentSignedUrls);

  return (
    <VehicleDetail
      vehicle={{ ...vehicle, signed_photo_url: signedPhotoUrl }}
      showMoney={showMoney}
      latestMaintenanceEntry={((maintenanceLog ?? []) as VehicleMaintenanceLogEntry[])[0] ?? null}
      documents={currentDocuments}
      signedUrlByDocId={signedUrlByDocId}
      activeOrgId={profile.active_org_id}
    />
  );
}
