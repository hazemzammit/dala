import { IconStatCard } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { ChartBarIcon, CoinsIcon, ReceiptIcon, TrendDownIcon, TrendUpIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { MiniBarChart, SectionCard } from '@/components/contractor/Screen';
import { MoneyRestricted } from '@/components/MoneyRestricted';
import { canSeeMoney, getOrgRole } from '@/lib/orgRole';
import { createClient } from '@/lib/supabase/server';

import { ReportsActions } from './ReportsActions';

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
  if (!canSeeMoney(await getOrgRole(supabase, orgId, user.id))) {
    return <MoneyRestricted title="Rapports" />;
  }

  // FLAGGED FOR HAZEM — same schema mismatch as projects/getProjectDashboard.ts,
  // client-portal/page.tsx, and dashboard/page.tsx: `invoices` has no
  // amount/status/paid_at columns (0074, deliberately). This is the fifth
  // route this integration pass has hit the exact same wrong assumption in
  // — a strong signal the collaborator was working from an imagined or
  // very stale invoices shape rather than the real migration, consistently
  // across the whole app, not just isolated typos. "Chiffre d'affaires"
  // below is now invoiced subtotal (all invoices issued), not "paid
  // revenue" — this schema has no way to know what's actually been paid.
  const { data: invoices } = await supabase
    .from('invoices')
    .select('subtotal, issued_at')
    .eq('org_id', orgId);

  const { data: expenses } = await supabase
    .from('project_expenses')
    .select('project_id, amount')
    .eq('org_id', orgId)
    .is('deleted_at', null);

  const { data: activeProjects } = await supabase
    .from('projects')
    .select('id, budget_total')
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');

  const revenue = (invoices ?? []).reduce((sum, inv) => sum + Number(inv.subtotal), 0);
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

  // Tendance 7 jours — chiffre d'affaires (factures émises) par jour de la semaine en cours.
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
    (invoices ?? [])
      .filter((inv) => inv.issued_at === date)
      .reduce((sum, inv) => sum + Number(inv.subtotal), 0),
  );

  const isLoss = profit < 0;
  // Doc 05 §1.7j — "Bénéfice −680 TND" is the confirmed gap: a period
  // profit/loss result rendered identically regardless of sign. This is
  // specifically the "Profit/loss" row of §1.7j's business-meaning
  // table — the fix is the LABEL ("Perte" instead of "Bénéfice"), with
  // color as a supplementary signal only, never the sole one. This is
  // deliberately NOT a blanket sign→color rule: "Dépenses" below is
  // always a positive figure and stays neutral-toned; if this org ever
  // had e.g. a negative "amount owed" figure, that would need its own
  // business-meaning read (§1.7j's "may be entirely normal" row), not
  // this same treatment reused by sign alone.
  const profitLabel = isLoss ? 'Perte' : 'Bénéfice';

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        icon={ChartBarIcon}
        title="Rapports"
        description="Consultez les dépenses, le chiffre d\u2019affaires, le bénéfice et le budget de votre organisation."
        actions={
          <>
            <Link href="/portfolio" className="text-accent-600 text-sm font-medium">
              Portefeuille →
            </Link>
            <Link href="/analytics" className="text-accent-600 text-sm font-medium">
              Analytique avancée →
            </Link>
            <ReportsActions
              revenue={revenue}
              expenses={totalExpenses}
              profit={profit}
              budgetUsedPercent={budgetUsedPercent}
            />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <IconStatCard
          icon={CoinsIcon}
          tone="neutral"
          label="Chiffre d’affaires"
          value={formatTND(revenue)}
        />
        <IconStatCard
          icon={isLoss ? TrendDownIcon : TrendUpIcon}
          tone={isLoss ? 'danger' : 'success'}
          valueTone={isLoss ? 'danger' : 'success'}
          label={profitLabel}
          value={formatTND(profit)}
        />
        <IconStatCard
          icon={ReceiptIcon}
          tone="neutral"
          label="Dépenses"
          value={formatTND(totalExpenses)}
        />
        <IconStatCard
          icon={ChartBarIcon}
          tone="accent"
          label="Budget utilisé"
          value={`${budgetUsedPercent}%`}
        />
      </div>

      <SectionCard
        title="Tendance du chiffre d'affaires"
        description="Revenu (factures émises) par jour, semaine en cours."
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
