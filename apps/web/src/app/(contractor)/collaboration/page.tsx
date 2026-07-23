import { UsersThreeIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Shared work"
        title="Collaboration"
        description="Coordinate multiple subcontractors, invitations, members, permissions, and shared projects."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ['Organizations', '8'],
          ['Invitations', '6 pending'],
          ['Members', '23'],
          ['Shared projects', '11'],
        ].map(([label, value]) => (
          <Card key={label} className="p-5" raised>
            <UsersThreeIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
          </Card>
        ))}
      </div>

      <SectionCard title="Organizations" description="Partner companies and access control.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            'Atlas BTP',
            'Sahara Steel',
            'Nour Electric',
            'Citec Finishers',
            'Medina HVAC',
            'Crown Logistics',
          ].map((item) => (
            <div
              key={item}
              className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5"
            >
              <p className="font-medium text-neutral-900">{item}</p>
              <p className="mt-1 text-sm text-neutral-500">
                Members, permissions, and shared project scope.
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
