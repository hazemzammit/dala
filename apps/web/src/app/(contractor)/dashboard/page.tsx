import { redirect } from 'next/navigation';

import { canSeeMoney, getOrgRole } from '@/lib/orgRole';
import { createClient } from '@/lib/supabase/server';

import { DashboardView } from './DashboardView';


export default async function DashboardPage() {
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
  // Viewers are money-blind (0103): expenses/invoices come back empty for them, so
  // the money KPIs are hidden rather than shown as a misleading "0 TND".
  const showMoney = canSeeMoney(await getOrgRole(supabase, orgId, user.id));
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const [
    { count: activeProjectsCount },
    { data: activeProjects },
    { data: presentToday },
    { count: availableVehiclesCount },
    { data: todayExpenses },
    { data: monthlyInvoicedSubtotals },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('lead_org_id', orgId)
      .is('deleted_at', null)
      .eq('status', 'active'),
    supabase
      .from('projects')
      .select('id, budget_total')
      .eq('lead_org_id', orgId)
      .is('deleted_at', null)
      .eq('status', 'active'),
    supabase
      .from('attendance_records')
      .select('worker_id')
      .eq('org_id', orgId)
      .eq('record_date', today)
      .eq('status', 'present'),
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'available'),
    supabase
      .from('project_expenses')
      .select('amount')
      .eq('org_id', orgId)
      .eq('expense_date', today)
      .is('deleted_at', null),
    // FLAGGED FOR HAZEM — same schema mismatch as projects/
    // getProjectDashboard.ts and client-portal/page.tsx: `invoices` has no
    // amount/status/paid_at columns at all (0074, deliberately — see that
    // migration's own comment). Original version filtered
    // status='paid' and used paid_at/amount, none of which exist. Now
    // sums this month's invoiced subtotal instead of a "paid this month"
    // figure the schema can't express.
    supabase
      .from('invoices')
      .select('subtotal')
      .eq('org_id', orgId)
      .gte('issued_at', monthStartStr),
  ]);

  const activeProjectIds = (activeProjects ?? []).map((p) => p.id);
  const { data: activeProjectExpenses } = activeProjectIds.length
    ? await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', activeProjectIds)
        .is('deleted_at', null)
    : { data: [] };

  const totalActiveBudget = (activeProjects ?? []).reduce(
    (sum, p) => sum + (p.budget_total ?? 0),
    0,
  );
  const totalActiveSpent = (activeProjectExpenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const budgetConsumedPercent =
    totalActiveBudget > 0 ? Math.round((totalActiveSpent / totalActiveBudget) * 100) : 0;

  const todayExpensesTotal = (todayExpenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const monthlyInvoicedTotal = (monthlyInvoicedSubtotals ?? []).reduce(
    (sum, inv) => sum + Number(inv.subtotal),
    0,
  );
  const distinctWorkersPresent = new Set((presentToday ?? []).map((a) => a.worker_id)).size;

  // Audit fix 6a — Doc 04 §4.2.2 says the web dashboard uses "same cards
  // ... same underlying queries" as mobile's Doc 03 §3.9, including the
  // activity feed. This used to be a derived pseudo-feed built from three
  // unrelated queries (site_logs/invoices/dispatch_assignments) instead
  // of org_activity_feed itself — missing expense_recorded and
  // safety_incident_reported events entirely, and never actually the
  // "same underlying query" the spec called for. Replaced with the real
  // table, mirroring apps/mobile's dashboard.tsx loadActivityFeed()
  // exactly, including routing actor-name resolution through
  // get_org_member_profiles (0085) rather than mobile's original direct
  // `.from('profiles')` call — mobile's own version of this lookup was
  // the same profiles_select_own (0005) RLS-gap bug Session 1 fixed
  // elsewhere (1c), so this new web copy is written against the fixed
  // RPC from the start rather than shipping that bug fresh here.
  const { data: activityEvents } = await supabase
    .from('org_activity_feed')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(8);
  const feed = activityEvents ?? [];

  const actorIds = Array.from(new Set(feed.map((e) => e.actor_id).filter(Boolean))) as string[];
  const feedProjectIds = Array.from(
    new Set(feed.map((e) => e.project_id).filter(Boolean)),
  ) as string[];
  const feedWorkerIds = Array.from(
    new Set(
      feed
        .filter((e) => e.event_type === 'dispatch_assigned')
        .map((e) => (e.metadata as Record<string, unknown> | null)?.worker_id as string | undefined)
        .filter(Boolean),
    ),
  ) as string[];

  const [{ data: actorRows }, { data: feedProjectRows }, { data: feedWorkerRows }] =
    await Promise.all([
      actorIds.length > 0
        ? supabase.rpc('get_org_member_profiles', { p_org_id: orgId }).then(({ data }) => ({
            data: (data ?? []).filter((p: { id: string; full_name: string }) =>
              actorIds.includes(p.id),
            ),
          }))
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      feedProjectIds.length > 0
        ? supabase.from('projects').select('id, name').in('id', feedProjectIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      feedWorkerIds.length > 0
        ? supabase.from('workers').select('id, full_name').in('id', feedWorkerIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);

  const actorNameById = Object.fromEntries(
    (actorRows ?? []).map((r: { id: string; full_name: string }) => [r.id, r.full_name]),
  );
  const feedProjectNameById = Object.fromEntries(
    (feedProjectRows ?? []).map((r) => [r.id, r.name]),
  );
  const feedWorkerNameById = Object.fromEntries(
    (feedWorkerRows ?? []).map((r) => [r.id, r.full_name]),
  );

  // Calendrier — nombre d'affectations dispatch par jour de la semaine en cours.
  const startOfWeek = new Date();
  const dayOfWeek = startOfWeek.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  const { data: weekDispatch } = await supabase
    .from('dispatch_assignments')
    .select('assignment_date, worker_id')
    .eq('org_id', orgId)
    .gte('assignment_date', weekDates[0])
    .lte('assignment_date', weekDates[6]);

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const calendarDays = weekDates.map((date, i) => {
    const count = (weekDispatch ?? []).filter((d) => d.assignment_date === date).length;
    return {
      day: dayLabels[i]!,
      date,
      count,
      label: count > 0 ? `${count} affectation${count > 1 ? 's' : ''}` : 'Aucune affectation',
      tone: (count === 0 ? 'accent' : count >= 5 ? 'success' : 'warning') as
        'accent' | 'success' | 'warning',
    };
  });

  return (
    <DashboardView
      stats={{
        activeProjectsCount: activeProjectsCount ?? 0,
        workersPresentToday: distinctWorkersPresent,
        availableVehiclesCount: availableVehiclesCount ?? 0,
        todayExpensesTotal,
        monthlyInvoicedTotal,
        budgetConsumedPercent,
      }}
      showMoney={showMoney}
      activityFeed={feed}
      actorNameById={actorNameById}
      feedProjectNameById={feedProjectNameById}
      feedWorkerNameById={feedWorkerNameById}
      calendarDays={calendarDays}
    />
  );
}
