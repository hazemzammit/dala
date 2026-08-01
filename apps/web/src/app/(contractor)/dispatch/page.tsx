import { redirect } from 'next/navigation';

import { DispatchView } from './DispatchView';

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

export default async function Page({ searchParams }: { searchParams?: { week?: string } }) {
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

  const requestedDate = searchParams?.week ? new Date(`${searchParams.week}T00:00:00`) : new Date();
  const normalizedDate = Number.isNaN(requestedDate.getTime()) ? new Date() : requestedDate;
  const weekStart = startOfWeek(normalizedDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const [projectsResult, vehiclesResult, workersResult, assignmentsResult] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, lead_org_id, name, client_name, address, budget_total, status, deleted_at, version, created_by, created_at, updated_at',
      )
      .eq('lead_org_id', profile.active_org_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id, org_id, name, plate, capacity, status, created_at')
      .eq('org_id', profile.active_org_id)
      .order('name', { ascending: true }),
    supabase
      .from('workers')
      .select('id, org_id, full_name, phone, trade, daily_rate, user_id, created_at')
      .eq('org_id', profile.active_org_id)
      .order('full_name', { ascending: true }),
    supabase
      .from('dispatch_assignments')
      .select(
        'id, org_id, project_id, vehicle_id, worker_id, assignment_date, departure_time, confirmation_channel, actual_departure_time, version, created_at',
      )
      .eq('org_id', profile.active_org_id)
      .gte('assignment_date', formatDateInput(weekStart))
      .lte('assignment_date', formatDateInput(weekEnd))
      .order('assignment_date', { ascending: true })
      .order('departure_time', { ascending: true }),
  ]);

  const projects = projectsResult.data ?? [];
  const vehicles = vehiclesResult.data ?? [];
  const workers = workersResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const workerById = new Map(workers.map((worker) => [worker.id, worker]));
  const projectById = new Map(projects.map((project) => [project.id, project]));

  const labeledAssignments = assignments.map((assignment) => ({
    ...assignment,
    workerName: workerById.get(assignment.worker_id)?.full_name ?? 'Ouvrier inconnu',
    vehicleName: vehicleById.get(assignment.vehicle_id ?? '')?.name ?? 'Véhicule inconnu',
    vehicleStatus: vehicleById.get(assignment.vehicle_id ?? '')?.status ?? 'available',
    projectName: projectById.get(assignment.project_id ?? '')?.name ?? 'Chantier inconnu',
  }));

  return (
    <DispatchView
      weekStart={formatDateInput(weekStart)}
      vehicles={vehicles}
      workers={workers}
      projects={projects}
      assignments={labeledAssignments}
    />
  );
}
