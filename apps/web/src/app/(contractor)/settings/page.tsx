import { GearIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Manage company information, users, roles, permissions, notifications, security, language, and appearance."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {['Company information', 'Users', 'Roles & permissions', 'Security & appearance'].map(
          (item) => (
            <Card key={item} className="p-5" raised>
              <GearIcon size={22} className="text-accent-700" />
              <p className="font-display mt-4 text-lg font-semibold text-neutral-900">{item}</p>
              <p className="mt-1 text-sm text-neutral-500">Open and configure this section.</p>
            </Card>
          ),
        )}
      </div>

      <SectionCard
        title="Configuration modules"
        description="Core settings areas for the company workspace."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            'Company Information',
            'Users',
            'Roles',
            'Permissions',
            'Notifications',
            'Security',
            'Language',
            'Appearance',
          ].map((item) => (
            <div
              key={item}
              className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5"
            >
              <p className="font-medium text-neutral-900">{item}</p>
              <p className="mt-1 text-sm text-neutral-500">
                Edit company defaults and team access.
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
