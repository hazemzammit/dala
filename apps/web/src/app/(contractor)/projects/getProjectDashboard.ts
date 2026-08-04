'use server';

import { createClient } from '@/lib/supabase/server';

export type ProjectDashboardData = {
  activeWorkersCount: number;
  lastJournalDate: string | null;
  pendingInvoicesAmount: number;
  budgetAlertLevel: 'none' | 'warning70' | 'warning90' | 'over100';
};

export async function getProjectDashboard(
  projectId: string,
  budgetTotal: number | null,
): Promise<ProjectDashboardData> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: assignments } = await supabase
    .from('dispatch_assignments')
    .select('worker_id')
    .eq('project_id', projectId)
    .gte('assignment_date', sevenDaysAgo.toISOString().slice(0, 10));

  const activeWorkersCount = new Set((assignments ?? []).map((a) => a.worker_id)).size;

  const { data: lastLog } = await supabase
    .from('site_logs')
    .select('created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: unpaidInvoices } = await supabase
    .from('invoices')
    .select('amount')
    .eq('project_id', projectId)
    .in('status', ['draft', 'sent', 'overdue']);

  const pendingInvoicesAmount = (unpaidInvoices ?? []).reduce((sum, inv) => sum + inv.amount, 0);

  const { data: expenses } = await supabase
    .from('project_expenses')
    .select('amount')
    .eq('project_id', projectId);

  const totalSpent = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const percentSpent = budgetTotal && budgetTotal > 0 ? (totalSpent / budgetTotal) * 100 : 0;

  let budgetAlertLevel: ProjectDashboardData['budgetAlertLevel'] = 'none';
  if (percentSpent >= 100) budgetAlertLevel = 'over100';
  else if (percentSpent >= 90) budgetAlertLevel = 'warning90';
  else if (percentSpent >= 70) budgetAlertLevel = 'warning70';

  return {
    activeWorkersCount,
    lastJournalDate: lastLog?.created_at ?? null,
    pendingInvoicesAmount,
    budgetAlertLevel,
  };
}
