import { ChartBarIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ReportsActions } from './ReportsActions';

import { MiniBarChart, PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';


function formatTND(value: number): string {
  return `${value.toLocaleString('fr-TN')} TND`;
}

const OPERATIONAL_LINKS = [
  { label: 'Dépenses', href: '/projects', description: 'Voir les dépenses par chantier.' },
  { label: 'Revenu', href: '/billing', description: 'Voir les factures et paiements.' },
  { label: 'Budget', href: '/projects', description: 'Voir le budget consommé par chantier.' },
  { label: 'Présence', href: '/pointage', description: 'Voir la présence des ouvriers.' },
  { label: 'Matériaux', href: '/materials', description: 'Voir les achats de matériaux.' },
  { label: 'Coûts véhicules', href: '/vehicles', description: 'Voir la flotte de véhicules.' },
];

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

  const { data: paidInvoices } = await supabase
    .from('invoices')
    .select('amount, paid_at')
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

  // Tendance 7 jours — chiffre d'affaires (factures payées) par jour de la semaine en cours.
  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const startOfWeek = new Date();
  const dow = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() + (dow === 0 ? -6 : 1 - dow));
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const trendValues = weekDates.map((date) =>
    (paidInvoices ?? [])
      .filter((inv) => inv.paid_at?.slice(0, 10) === date)
      .reduce((sum, inv) => sum + inv.amount, 0),
  );

  const stats = [
    { label: 'Chiffre d\u2019affaires', value: formatTND(revenue) },
    { label: 'Bénéfice', value: formatTND(profit) },
    { label: 'Dépenses', value: formatTND(totalExpenses) },
    { label: 'Budget utilisé', value: `${budgetUsedPercent}%` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Analytique"
        title="Rapports"
        description="Consultez les dépenses, le chiffre d\u2019affaires, le bénéfice et le budget de votre organisation."
        actions={
          <ReportsActions
            revenue={revenue}
            expenses={totalExpenses}
            profit={profit}
            budgetUsedPercent={budgetUsedPercent}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5" raised>
            <ChartBarIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {stat.label}
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {stat.value}
            </p>
          </Card>
        ))}
      </div>

      <SectionCard
        title="Tendance du chiffre d'affaires"
        description="Revenu (factures payées) par jour, semaine en cours."
      >
        <MiniBarChart values={trendValues} labels={dayLabels} />
      </SectionCard>

      <SectionCard
        title="Indicateurs opérationnels"
        description="Accès rapide aux données détaillées par domaine."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {OPERATIONAL_LINKS.map((item) => (
            <Link key={item.label} href={item.href}>
              <div className="bg-neutral-25 hover:border-accent-300 rounded-2xl border border-neutral-100 px-4 py-5 transition-colors">
                <p className="font-medium text-neutral-900">{item.label}</p>
                <p className="mt-1 text-sm text-neutral-500">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
