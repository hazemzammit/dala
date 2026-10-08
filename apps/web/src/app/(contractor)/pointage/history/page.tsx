import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { createClient } from '@/lib/supabase/server';

import { AttendanceHistoryView } from './AttendanceHistoryView';


/**
 * apps/web/src/app/(contractor)/pointage/history/page.tsx
 *
 * Gap-closure guide §1.2 — web equivalent of mobile's attendance-history.tsx
 * + components/attendance/AttendanceHistory.tsx. Read/history screen only —
 * corrections still go through `saveManualAttendance` in
 * `pointage/actions.ts` (append-only insert, unchanged). This route is the
 * org-wide entry point (no workerId), same as mobile's screen wrapper;
 * a per-worker locked view isn't built this phase (no worker-detail page
 * exists yet on web to host it).
 *
 * Same 60-day window as mobile, same three-query shape
 * (attendance_effective for the resolved status, attendance_records for
 * full per-day history, profiles for recorded_by name resolution).
 * `recorded_by` is currently always null in every existing write path
 * (confirmed in pointage/actions.ts and worker check-in flows) — the
 * profiles join here is implemented and will resolve names the moment a
 * future write path starts setting it, exactly like mobile's own comment
 * discloses.
 */
const WINDOW_DAYS = 60;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

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
  const start = isoDaysAgo(WINDOW_DAYS - 1);
  const end = isoDaysAgo(0);

  const [{ data: workers }, { data: effectiveRows }, { data: rawRows }] = await Promise.all([
    supabase
      .from('worker_directory')
      .select(
        'id, org_id, full_name, email, phone, trade, daily_rate, user_id, created_at, deleted_at, photo_url',
      )
      .eq('org_id', orgId)
      .order('full_name', { ascending: true }),
    supabase
      .from('attendance_effective')
      .select('worker_id, record_date, status')
      .eq('org_id', orgId)
      .gte('record_date', start)
      .lte('record_date', end),
    supabase
      .from('attendance_records')
      .select('id, worker_id, record_date, status, source, recorded_by, absence_reason, created_at')
      .eq('org_id', orgId)
      .gte('record_date', start)
      .lte('record_date', end)
      .order('created_at', { ascending: true }),
  ]);

  const distinctRecordedBy = Array.from(
    new Set((rawRows ?? []).map((r) => r.recorded_by).filter((v): v is string => !!v)),
  );

  // Audit fix 1b — profiles_select_own (0005) is `id = auth.uid()` only,
  // so this direct `.from('profiles')` batch query silently returned zero
  // rows for any recorded_by other than the caller (masked downstream by
  // "Non renseigné"). get_org_member_profiles (0085) closes that gap; it
  // returns the whole org roster, which distinctRecordedBy then filters
  // down to just the ids this page actually needs.
  const recordedByName: Record<string, string> = {};
  if (distinctRecordedBy.length > 0) {
    const { data: profileRows } = await supabase.rpc('get_org_member_profiles', {
      p_org_id: orgId,
    });
    const distinctSet = new Set(distinctRecordedBy);
    (profileRows ?? []).forEach((p: { id: string; full_name: string | null }) => {
      if (p.full_name && distinctSet.has(p.id)) recordedByName[p.id] = p.full_name;
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <Suspense fallback={<div className="p-8 text-sm text-neutral-500">Chargement...</div>}>
        <AttendanceHistoryView
          windowDays={WINDOW_DAYS}
          workers={workers ?? []}
          effectiveRows={effectiveRows ?? []}
          rawRows={rawRows ?? []}
          recordedByName={recordedByName}
        />
      </Suspense>
    </div>
  );
}
