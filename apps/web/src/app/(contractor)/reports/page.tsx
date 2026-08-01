import { ChartBarIcon } from '@phosphor-icons/react/ssr';

import { ReportsActions } from './ReportsActions';

import { PageHeader, MiniBarChart, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Analytique"
        title="Rapports"
        description="Consultez les dépenses, le chiffre d’affaires, le bénéfice, le budget, la présence, les matériaux et les coûts véhicules."
        actions={<ReportsActions />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Chiffre d’affaires', '246 800 TND'],
          ['Bénéfice', '61 250 TND'],
          ['Dépenses', '185 550 TND'],
          ['Budget utilisé', '68%'],
        ].map(([label, value]) => (
          <Card key={label} className="p-5" raised>
            <ChartBarIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
          </Card>
        ))}
      </div>

      <SectionCard
        title="Tendance des rapports"
        description="Aperçu des performances sur sept jours."
      >
        <MiniBarChart
          values={[45, 58, 52, 70, 63, 82, 75]}
          labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
        />
      </SectionCard>

      <SectionCard
        title="Indicateurs opérationnels"
        description="KPI regroupés pour le tableau de bord des rapports."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            'Expenses',
            'Revenue',
            'Profit',
            'Budget',
            'Attendance',
            'Materials',
            'Coûts véhicules',
          ].map((item) => (
            <div
              key={item}
              className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5"
            >
              <p className="font-medium text-neutral-900">{item}</p>
              <p className="mt-1 text-sm text-neutral-500">
                Ouvrir le graphique et les résumés de performance.
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
