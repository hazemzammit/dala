import { GearIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { PageHeader, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

const topCards = [
  {
    label: 'Company information',
    labelFr: "Informations de l'entreprise",
    href: '/settings/company',
  },
  { label: 'Users', labelFr: 'Équipe', href: '/team' },
  { label: 'Roles & permissions', labelFr: 'Rôles & permissions', href: '/settings/roles' },
  { label: 'Security & appearance', labelFr: 'Sécurité & apparence', href: null },
];

const configModules = [
  { label: 'Company Information', href: '/settings/company' },
  { label: 'Users', href: '/team' },
  { label: 'Roles', href: '/settings/roles' },
  { label: 'Permissions', href: null },
  { label: 'Notifications', href: null },
  { label: 'Security', href: null },
  { label: 'Language', href: null },
  { label: 'Appearance', href: null },
];

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Manage company information, users, roles, permissions, notifications, security, language, and appearance."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {topCards.map((item) =>
          item.href ? (
            <Link key={item.label} href={item.href}>
              <Card className="hover:border-accent-300 h-full p-5 transition-colors" raised>
                <GearIcon size={22} className="text-accent-700" />
                <p className="font-display mt-4 text-lg font-semibold text-neutral-900">
                  {item.labelFr}
                </p>
                <p className="mt-1 text-sm text-neutral-500">Ouvrir cette section.</p>
              </Card>
            </Link>
          ) : (
            <Card key={item.label} className="p-5 opacity-60" raised>
              <GearIcon size={22} className="text-neutral-400" />
              <p className="font-display mt-4 text-lg font-semibold text-neutral-900">
                {item.labelFr}
              </p>
              <p className="mt-1 text-sm text-neutral-500">Bientôt disponible.</p>
            </Card>
          ),
        )}
      </div>

      <SectionCard
        title="Configuration modules"
        description="Core settings areas for the company workspace."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configModules.map((item) =>
            item.href ? (
              <Link key={item.label} href={item.href}>
                <div className="bg-neutral-25 hover:border-accent-300 rounded-2xl border border-neutral-100 px-4 py-5 transition-colors">
                  <p className="font-medium text-neutral-900">{item.label}</p>
                  <p className="mt-1 text-sm text-neutral-500">Ouvrir cette section.</p>
                </div>
              </Link>
            ) : (
              <div
                key={item.label}
                className="bg-neutral-25 rounded-2xl border border-neutral-100 px-4 py-5 opacity-60"
              >
                <p className="font-medium text-neutral-900">{item.label}</p>
                <p className="mt-1 text-sm text-neutral-500">Bientôt disponible.</p>
              </div>
            ),
          )}
        </div>
      </SectionCard>
    </div>
  );
}
