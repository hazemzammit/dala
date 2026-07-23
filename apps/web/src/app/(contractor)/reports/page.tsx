import { ChartBarIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, MiniBarChart, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        description="Review expenses, revenue, profit, budget, attendance, materials, and vehicle costs."
        actions={
          <>
            <button className="bg-neutral-0 rounded-2xl border border-neutral-200 px-4 py-2.5 text-sm font-medium">
              Download PDF
            </button>
            <button className="bg-accent-600 rounded-2xl px-4 py-2.5 text-sm font-medium text-white">
              Export Excel
            </button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Revenue', '246,800 TND'],
          ['Profit', '61,250 TND'],
          ['Expenses', '185,550 TND'],
          ['Budget used', '68%'],
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

      <SectionCard title="Report trend" description="Seven day performance snapshot.">
        <MiniBarChart
          values={[45, 58, 52, 70, 63, 82, 75]}
          labels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
        />
      </SectionCard>

      <SectionCard
        title="Operational metrics"
        description="Grouped KPIs for the reporting dashboard."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            'Expenses',
            'Revenue',
            'Profit',
            'Budget',
            'Attendance',
            'Materials',
            'Vehicle Costs',
          ].map((item) => (
            <div
              key={item}
              className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5"
            >
              <p className="font-medium text-neutral-900">{item}</p>
              <p className="mt-1 text-sm text-neutral-500">Open chart and performance summaries.</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
