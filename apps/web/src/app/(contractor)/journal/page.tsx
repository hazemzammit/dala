import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { JournalView, type SiteLogWithSignedUrl } from './JournalView';

import { createClient } from '@/lib/supabase/server';

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams?: { date?: string } }) {
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

  const selectedDate = searchParams?.date ?? formatDateInput(new Date());
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const weekStart = startOfWeek(
    Number.isNaN(selectedDateObject.getTime()) ? new Date() : selectedDateObject,
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Charge les projets actifs de l'organisation
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, deleted_at')
    .eq('lead_org_id', profile.active_org_id)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  // Charge les dernières entrées de site_logs pour cette organisation
  const { data: rawLogs } = await supabase
    .from('site_logs')
    .select('id, org_id, project_id, photo_url, caption, logged_by, created_at')
    .eq('org_id', profile.active_org_id)
    .gte('created_at', weekStart.toISOString())
    .lte('created_at', new Date(`${formatDateInput(weekEnd)}T23:59:59.999Z`).toISOString())
    .order('created_at', { ascending: false });

  // Génération des URLs signées avec expiration d'une heure (3600 s - Doc 07 §7.4)
  const siteLogs: SiteLogWithSignedUrl[] = await Promise.all(
    (rawLogs ?? []).map(async (log) => {
      const { data } = await supabase.storage
        .from('site-logs')
        .createSignedUrl(log.photo_url, 3600);

      return {
        ...log,
        signed_photo_url: data?.signedUrl ?? null,
      };
    }),
  );

  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-neutral-500">Chargement du journal...</div>}
    >
      <JournalView
        orgId={profile.active_org_id}
        projects={projects ?? []}
        siteLogs={siteLogs}
        selectedDate={selectedDate}
      />
    </Suspense>
  );
}
