import { HandshakeIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, ProgressBar, SectionCard, TimelineList } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Client access"
        title="Client Portal"
        description="Give clients a focused view of progress, invoices, reports, and timeline updates."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ['Open projects', '5'],
          ['Invoices sent', '12'],
          ['Payments received', '9'],
          ['Reports shared', '18'],
        ].map(([label, value]) => (
          <Card key={label} className="p-5" raised>
            <HandshakeIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
          </Card>
        ))}
      </div>

      <SectionCard
        title="Project progress"
        description="Live view for clients across the current portfolio."
      >
        <div className="space-y-4">
          {[
            { name: 'El Baraka Residence', progress: 72 },
            { name: 'Coastal Villas', progress: 48 },
            { name: 'School Annex', progress: 89 },
          ].map((item) => (
            <div key={item.name}>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-neutral-900">{item.name}</span>
                <span className="text-neutral-500">{item.progress}%</span>
              </div>
              <ProgressBar value={item.progress} tone={item.progress > 80 ? 'success' : 'accent'} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Client updates"
        description="Shared reports, timeline events, and invoice notes."
      >
        <TimelineList
          items={[
            {
              title: 'Monthly progress report shared',
              description: 'Client received the latest PDF summary.',
              time: 'Yesterday',
              tone: 'success',
            },
            {
              title: 'Invoice reminder sent',
              description: 'Two payment reminders are pending acknowledgment.',
              time: 'Today',
              tone: 'warning',
            },
            {
              title: 'Photo album updated',
              description: 'Twelve new site photos uploaded for review.',
              time: 'Today',
              tone: 'accent',
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
