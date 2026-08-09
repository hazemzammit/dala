import { redirect } from 'next/navigation';

import { DashboardView } from './DashboardView';

import { createClient } from '@/lib/supabase/server';


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
    { data: paidInvoicesThisMonth },
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
      .eq('expense_date', today),
    supabase
      .from('invoices')
      .select('amount')
      .eq('org_id', orgId)
      .eq('status', 'paid')
      .gte('paid_at', monthStartStr),
  ]);

  const activeProjectIds = (activeProjects ?? []).map((p) => p.id);
  const { data: activeProjectExpenses } = activeProjectIds.length
    ? await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', activeProjectIds)
    : { data: [] };

  const totalActiveBudget = (activeProjects ?? []).reduce(
    (sum, p) => sum + (p.budget_total ?? 0),
    0,
  );
  const totalActiveSpent = (activeProjectExpenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const budgetConsumedPercent =
    totalActiveBudget > 0 ? Math.round((totalActiveSpent / totalActiveBudget) * 100) : 0;

  const todayExpensesTotal = (todayExpenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const monthlyRevenue = (paidInvoicesThisMonth ?? []).reduce((sum, inv) => sum + inv.amount, 0);
  const distinctWorkersPresent = new Set((presentToday ?? []).map((a) => a.worker_id)).size;

  const [{ data: recentLogs }, { data: recentPaidInvoices }, { data: recentDispatch }] =
    await Promise.all([
      supabase
        .from('site_logs')
        .select('caption, created_at, projects(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('invoices')
        .select('invoice_number, client_name, paid_at')
        .eq('org_id', orgId)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(3),
      supabase
        .from('dispatch_assignments')
        .select('assignment_date, created_at, projects(name)')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

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
  const normalizedLogs = (recentLogs ?? []).map((log) => ({
    caption: log.caption,
    created_at: log.created_at,
    projects: Array.isArray(log.projects) ? (log.projects[0] ?? null) : log.projects,
  }));

  const normalizedDispatch = (recentDispatch ?? []).map((d) => ({
    assignment_date: d.assignment_date,
    created_at: d.created_at,
    projects: Array.isArray(d.projects) ? (d.projects[0] ?? null) : d.projects,
  }));
  return (
    <DashboardView
      stats={{
        activeProjectsCount: activeProjectsCount ?? 0,
        workersPresentToday: distinctWorkersPresent,
        availableVehiclesCount: availableVehiclesCount ?? 0,
        todayExpensesTotal,
        monthlyRevenue,
        budgetConsumedPercent,
      }}
      recentLogs={normalizedLogs}
      recentPaidInvoices={recentPaidInvoices ?? []}
      recentDispatch={normalizedDispatch}
      calendarDays={calendarDays}
    />
  );
}
