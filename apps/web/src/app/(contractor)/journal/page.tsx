import { CameraIcon, MicrophoneIcon, NotePencilIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, SectionCard, TimelineList } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Site log"
        title="Daily Journal"
        description="Capture photos, voice notes, blockers, and completed tasks for each job site."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { icon: CameraIcon, label: 'Upload photos' },
          { icon: MicrophoneIcon, label: 'Record voice notes' },
          { icon: NotePencilIcon, label: 'Write daily notes' },
        ].map(({ icon: Icon, label }) => (
          <Card key={label} className="p-5" raised>
            <Icon size={22} className="text-accent-700" />
            <p className="font-display mt-4 text-lg font-semibold text-neutral-900">{label}</p>
            <p className="mt-1 text-sm text-neutral-500">
              Add evidence and summary notes for the day.
            </p>
          </Card>
        ))}
      </div>

      <SectionCard title="Progress snapshot" description="How the current workday is progressing.">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Completed tasks', '18'],
            ['Blocked tasks', '3'],
            ['Photos uploaded', '42'],
            ['Progress', '76%'],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {label}
              </p>
              <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
            </Card>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Today" description="Log of the latest site updates.">
        <TimelineList
          items={[
            {
              title: 'Foundation pour completed',
              description: 'Concrete check passed for the morning batch.',
              time: '08:40',
              tone: 'success',
            },
            {
              title: 'Delivery delayed',
              description: 'Rebar truck arrived 45 minutes late due to traffic.',
              time: '10:15',
              tone: 'warning',
            },
            {
              title: 'Client change request',
              description: 'Second-floor wall alignment adjusted on-site.',
              time: '13:05',
              tone: 'accent',
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
