import { ShieldWarningIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Compliance"
        title="Safety"
        description="Track incidents, PPE checks, site inspections, and risk alerts before they escalate."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ['Incidents', '2 open'],
          ['PPE checklist', '94% compliant'],
          ['Risk alerts', '1 high'],
          ['Inspections', '8 completed'],
        ].map(([label, value]) => (
          <Card key={label} className="p-5" raised>
            <ShieldWarningIcon size={22} className="text-warning" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
          </Card>
        ))}
      </div>

      <SectionCard
        title="Safety modules"
        description="Core controls used on a live construction site."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {['Incidents', 'PPE Checklist', 'Safety Reports', 'Risk Alerts', 'Inspection Forms'].map(
            (item) => (
              <div
                key={item}
                className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5"
              >
                <p className="font-medium text-neutral-900">{item}</p>
                <p className="mt-1 text-sm text-neutral-500">
                  Open and review all records for this module.
                </p>
              </div>
            ),
          )}
        </div>
      </SectionCard>
    </div>
  );
}
