import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { createClient } from '@/lib/supabase/server';

import { PointageView } from './PointageView';


function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function Page(props: { searchParams?: Promise<{ date?: string }> }) {
  const searchParams = await props.searchParams;
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

  const [workersResult, projectsResult, recordsResult] = await Promise.all([
    supabase
      .from('active_worker_directory')
      .select(
        'id, org_id, full_name, email, phone, trade, daily_rate, user_id, created_at, deleted_at, photo_url',
      )
      .eq('org_id', profile.active_org_id)
      .order('full_name', { ascending: true }),
    supabase
      .from('projects')
      .select(
        'id, lead_org_id, name, client_name, address, budget_total, status, project_type, start_date, cover_photo_url, deleted_at, version, created_by, created_at, updated_at',
      )
      .eq('lead_org_id', profile.active_org_id)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    supabase
      .from('attendance_records')
      .select(
        'id, org_id, worker_id, project_id, record_date, status, source, recorded_by, created_at, updated_at, absence_reason',
      )
      .eq('org_id', profile.active_org_id)
      .eq('record_date', selectedDate)
      .order('created_at', { ascending: false }),
  ]);

  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-neutral-500">Chargement du pointage...</div>}
    >
      <PointageView
        date={selectedDate}
        workers={workersResult.data ?? []}
        projects={projectsResult.data ?? []}
        attendanceRecords={recordsResult.data ?? []}
      />
    </Suspense>
  );
}
