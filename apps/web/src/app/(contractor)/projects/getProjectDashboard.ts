'use server';

import { createClient } from '@/lib/supabase/server';

export type ProjectDashboardData = {
  activeWorkersCount: number;
  lastJournalDate: string | null;
  invoicedAmount: number;
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

  /**
   * FLAGGED FOR HAZEM — the original version of this query selected
   * `amount`/filtered `status in ('draft','sent','overdue')` on `invoices`.
   * Neither exists on the real table (migration 0074): it has `subtotal`,
   * not `amount`, and — per that migration's own comment — deliberately
   * has NO payment-status column at all ("adding one would be scope
   * beyond what was asked"). So "pending/unpaid invoices" isn't a
   * distinction this schema can currently make; this now sums ALL
   * invoices generated for the project rather than inventing a
   * draft/sent/paid state that doesn't exist. Worth a real decision on
   * whether the billing rebuild (Phase 3) should add payment-status
   * tracking, but not something to guess at here.
   */
  const { data: invoices } = await supabase
    .from('invoices')
    .select('subtotal')
    .eq('project_id', projectId);

  const invoicedAmount = (invoices ?? []).reduce((sum, inv) => sum + Number(inv.subtotal), 0);

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
    invoicedAmount,
    budgetAlertLevel,
  };
}
