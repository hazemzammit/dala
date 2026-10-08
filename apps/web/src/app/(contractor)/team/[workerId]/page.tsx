import type { AttendanceStatus } from '@dala/shared-types';
import { notFound, redirect } from 'next/navigation';

import { canSeeMoney, getOrgRole } from '@/lib/orgRole';
import {
  ATTENDANCE_DAY_VALUE,
  attendancePercent,
  cycleEndISO,
  cycleStartISO,
  elapsedCycleDays,
} from '@/lib/salaryCycle';
import { createClient } from '@/lib/supabase/server';

import { WorkerDetail } from './WorkerDetail';

/**
 * Worker detail page (web consistency plan §2.9) — the addressable successor
 * of TeamView's inline detail card. Same auth/org resolution as the team
 * list page; the by-id fetch is the same `active_workers` select scoped to
 * the caller's org so a foreign id 404s instead of leaking.
 *
 * Resolves the three payroll figures the list's Step 12c wiring computes
 * (same sources and cycle boundaries as team/page.tsx): attendance from
 * attendance_effective (0036) over the current Monday-start cycle, approved
 * advances (0019) since it started, and the latest dispatch_assignments row
 * (0035) within 30 days.
 */
export default async function Page(props: { params: Promise<{ workerId: string }> }) {
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

  const { data: worker } = await supabase
    .from('active_worker_directory')
    .select(
      'id, org_id, full_name, email, phone, trade, daily_rate, user_id, created_at, deleted_at, photo_url, job_title, hire_date',
    )
    .eq('id', params.workerId)
    .eq('org_id', profile.active_org_id)
    .maybeSingle();
  if (!worker) notFound();

  // Field-coverage pass — photo_url is a private org-files storage path
  // (never a fetchable URL directly), same signed-URL-per-row convention
  // safety/page.tsx and projects/page.tsx already use for their own photo
  // fields.
  let signedPhotoUrl: string | null = null;
  if (worker.photo_url) {
    const { data } = await supabase.storage.from('org-files').createSignedUrl(worker.photo_url, 3600);
    signedPhotoUrl = data?.signedUrl ?? null;
  }

  // Latest invitation, same shape the list page resolves per worker.
  const { data: invitations } = await supabase
    .from('worker_invitations')
    .select('worker_id, status')
    .eq('worker_id', params.workerId)
    .order('sent_at', { ascending: false })
    .limit(1);

  // The three payroll figures (plan Step 12c) — identical sources and cycle
  // boundaries as the team list page: attendance_effective (0036) over the
  // current Monday-start cycle, approved advances (0019) since it started,
  // and the latest dispatch_assignments row (0035) within 30 days.
  const cycleStart = cycleStartISO();
  const cycleEnd = cycleEndISO();
  const elapsedDays = elapsedCycleDays();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  const assignmentWindowStart = windowStart.toISOString().slice(0, 10);

  const [attendanceRes, advanceRes, assignmentRes] = await Promise.all([
    supabase
      .from('attendance_effective')
      .select('worker_id, status')
      .eq('org_id', profile.active_org_id)
      .eq('worker_id', params.workerId)
      .gte('record_date', cycleStart)
      .lte('record_date', cycleEnd),
    supabase
      .from('advances')
      .select('worker_id, amount, status')
      .eq('org_id', profile.active_org_id)
      .eq('worker_id', params.workerId)
      .gte('created_at', cycleStart),
    supabase
      .from('dispatch_assignments')
      .select('worker_id, project_id, assignment_date, projects(name)')
      .eq('org_id', profile.active_org_id)
      .eq('worker_id', params.workerId)
      .gte('assignment_date', assignmentWindowStart)
      .order('assignment_date', { ascending: false })
      .limit(1),
  ]);

  // Weighted attended days → % of cycle days elapsed (present=1, half_day=0.5).
  const weightedDays = (attendanceRes.data ?? []).reduce(
    (sum, row) => sum + (ATTENDANCE_DAY_VALUE[row.status as AttendanceStatus] ?? 0),
    0,
  );
  const attendance = attendancePercent(weightedDays, elapsedDays);

  // Approved-only advance sum since the cycle started — mobile's convention.
  const salaryAdvance = (advanceRes.data ?? []).reduce(
    (sum, row) => (row.status === 'approved' ? sum + Number(row.amount) : sum),
    0,
  );

  // The limit(1) + date-descending order picks the latest assignment; the
  // joined project renders through the same array/object join guard as the
  // list page.
  const assignment = (assignmentRes.data ?? [])[0] ?? null;
  const joinedProject = assignment
    ? Array.isArray(assignment.projects)
      ? assignment.projects[0]
      : assignment.projects
    : null;
  const currentProject = joinedProject?.name ?? '—';

  // Viewers are money-blind (0103): strip pay figures server-side (presentation only until the
  // compensation split — see migration 0103's header).
  const showMoney = canSeeMoney(await getOrgRole(supabase, profile.active_org_id, user.id));

  return (
    <WorkerDetail
      showMoney={showMoney}
      worker={{ ...worker, daily_rate: showMoney ? worker.daily_rate : null, signed_photo_url: signedPhotoUrl }}
      invitationStatus={invitations?.[0]?.status ?? null}
      attendance={attendance}
      currentProject={currentProject}
      salaryAdvance={showMoney ? salaryAdvance : 0}
      activeOrgId={profile.active_org_id}
    />
  );
}
