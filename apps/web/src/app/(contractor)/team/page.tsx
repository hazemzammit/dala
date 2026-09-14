import type { AttendanceStatus } from '@dala/shared-types';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { TeamView } from './TeamView';

import {
  ATTENDANCE_DAY_VALUE,
  attendancePercent,
  cycleEndISO,
  cycleStartISO,
  elapsedCycleDays,
} from '@/lib/salaryCycle';
import { createClient } from '@/lib/supabase/server';

/**
 * Doc 04 §4.2.5 — Team roster. Fetches workers + their latest invitation
 * status (pending/accepted/expired) in one page load; TeamView (client)
 * owns the invite modal.
 *
 * Also resolves the three per-worker payroll figures TeamView used to
 * fabricate from the row index (plan Step 12c): attendance from
 * `attendance_effective` (0036) over the current Monday-start salary cycle,
 * the current project from the worker's latest `dispatch_assignments` row
 * (0035) within the last 30 days, and the advance balance from approved
 * `advances` (0019) created since the cycle started — the same sources and
 * weights apps/mobile's advances.tsx uses, with the cycle boundaries from
 * web's own lib/salaryCycle.ts (the same Monday as mobile's, byte-for-byte).
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

  const { data: workers } = await supabase
    .from('active_workers')
    .select(
      'id, org_id, full_name, email, phone, trade, daily_rate, user_id, created_at, deleted_at, photo_url',
    )
    .eq('org_id', profile.active_org_id)
    .order('created_at', { ascending: false });

  const workerIds = (workers ?? []).map((w) => w.id);
  const { data: invitations } = workerIds.length
    ? await supabase
        .from('worker_invitations')
        .select('worker_id, status, sent_at, expires_at')
        .in('worker_id', workerIds)
        .order('sent_at', { ascending: false })
    : { data: [] };

  // Payroll figures (plan Step 12c) — three org-scoped reads, mirroring
  // apps/mobile's advances.tsx Promise.all shape. All gated on the roster
  // being non-empty so a fresh org doesn't issue three no-op queries.
  const cycleStart = cycleStartISO();
  const cycleEnd = cycleEndISO();
  const elapsedDays = elapsedCycleDays();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const assignmentWindowStart = windowStart.toISOString().slice(0, 10);

  let attendanceData: { worker_id: string; status: string }[] = [];
  let advanceData: { worker_id: string; amount: number; status: string }[] = [];
  let assignmentData: {
    worker_id: string;
    assignment_date: string;
    projects: { name: string } | { name: string }[] | null;
  }[] = [];

  if (workerIds.length) {
    const [attendanceRes, advanceRes, assignmentRes] = await Promise.all([
      supabase
        .from('attendance_effective')
        .select('worker_id, status')
        .eq('org_id', profile.active_org_id)
        .gte('record_date', cycleStart)
        .lte('record_date', cycleEnd),
      supabase
        .from('advances')
        .select('worker_id, amount, status')
        .eq('org_id', profile.active_org_id)
        .gte('created_at', cycleStart),
      supabase
        .from('dispatch_assignments')
        .select('worker_id, project_id, assignment_date, projects(name)')
        .eq('org_id', profile.active_org_id)
        .gte('assignment_date', assignmentWindowStart)
        .order('assignment_date', { ascending: false }),
    ]);
    attendanceData = (attendanceRes.data ?? []) as typeof attendanceData;
    advanceData = (advanceRes.data ?? []) as typeof advanceData;
    assignmentData = (assignmentRes.data ?? []) as typeof assignmentData;
  }

  // Weighted attended days → % of cycle days elapsed (present=1, half_day=0.5).
  const weightedByWorker: Record<string, number> = {};
  for (const row of attendanceData) {
    const value = ATTENDANCE_DAY_VALUE[row.status as AttendanceStatus] ?? 0;
    weightedByWorker[row.worker_id] = (weightedByWorker[row.worker_id] ?? 0) + value;
  }
  const attendanceByWorker: Record<string, number> = {};
  for (const worker of workers ?? []) {
    attendanceByWorker[worker.id] = attendancePercent(
      weightedByWorker[worker.id] ?? 0,
      elapsedDays,
    );
  }

  // Approved advances since the cycle started — mobile's approvedByWorker.
  const salaryAdvanceByWorker: Record<string, number> = {};
  for (const advance of advanceData) {
    if (advance.status !== 'approved') continue;
    salaryAdvanceByWorker[advance.worker_id] =
      (salaryAdvanceByWorker[advance.worker_id] ?? 0) + Number(advance.amount);
  }

  // Latest assignment wins (rows arrive date-descending); 30-day window.
  const currentProjectByWorker: Record<string, string> = {};
  for (const row of assignmentData) {
    if (currentProjectByWorker[row.worker_id] !== undefined) continue;
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects;
    if (project?.name) currentProjectByWorker[row.worker_id] = project.name;
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-neutral-900">Équipe</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Invitez vos ouvriers pour suivre présence, avances et affectations.
        </p>
      </div>

      <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
        <TeamView
          workers={workers ?? []}
          invitations={invitations ?? []}
          attendanceByWorker={attendanceByWorker}
          currentProjectByWorker={currentProjectByWorker}
          salaryAdvanceByWorker={salaryAdvanceByWorker}
        />
      </Suspense>
    </div>
  );
}
