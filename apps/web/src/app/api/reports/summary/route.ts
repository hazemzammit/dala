import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';

import { ReportSummaryDocument } from '@/lib/pdf/ReportSummaryDocument';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) {
    return NextResponse.json({ error: 'Aucune organisation active.' }, { status: 400 });
  }

  const orgId = profile.active_org_id;

  const { data: organization } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single();

  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select('amount')
    .eq('org_id', orgId)
    .eq('status', 'paid');

  const { data: expenses } = await supabase
    .from('project_expenses')
    .select('project_id, amount')
    .eq('org_id', orgId);

  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id, budget_total')
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');

  const revenue = (paidInvoices ?? []).reduce((sum, inv) => sum + inv.amount, 0);
  const totalExpenses = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  const profit = revenue - totalExpenses;

  const activeProjectIds = new Set((activeProjects ?? []).map((p) => p.id));
  const activeProjectExpenses = (expenses ?? []).filter((e) => activeProjectIds.has(e.project_id));
  const totalActiveBudget = (activeProjects ?? []).reduce(
    (sum, p) => sum + (p.budget_total ?? 0),
    0,
  );
  const budgetUsedPercent =
    totalActiveBudget > 0
      ? Math.round(
          (activeProjectExpenses.reduce((sum, e) => sum + e.amount, 0) / totalActiveBudget) * 100,
        )
      : 0;

  const buffer = await renderToBuffer(
    ReportSummaryDocument({
      organizationName: organization?.name ?? '—',
      generatedAt: new Date().toLocaleString('fr-TN'),
      revenue,
      expenses: totalExpenses,
      profit,
      budgetUsedPercent,
    }),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="rapport-dala.pdf"',
    },
  });
}
