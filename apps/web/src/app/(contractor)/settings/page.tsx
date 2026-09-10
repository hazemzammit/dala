import { Card } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { GearIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';

import { SectionCard } from '@/components/contractor/Screen';
const topCards = [
  {
    label: 'Informations de l’entreprise',
    labelFr: "Informations de l'entreprise",
    href: '/settings/company',
  },
  { label: 'Équipe', labelFr: 'Équipe', href: '/team' },
  { label: 'Rôles & permissions', labelFr: 'Rôles & permissions', href: '/settings/roles' },
  { label: 'Sécurité & apparence', labelFr: 'Sécurité & apparence', href: null },
];

const configModules = [
  { label: 'Informations de l’entreprise', href: '/settings/company' },
  { label: 'Équipe', href: '/team' },
  { label: 'Rôles', href: '/settings/roles' },
  { label: 'Mon compte', href: '/settings/account' },
  { label: 'Permissions', href: null },
  { label: 'Notifications', href: '/settings/notifications' },
  { label: 'Sécurité', href: '/settings/security' },
  { label: 'Langue', href: null },
  { label: 'Apparence', href: null },
  { label: 'Corbeille', href: '/trash' },
  { label: 'Signaler un problème', href: '/feedback' },
];

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        eyebrow="Administration"
        title="Paramètres"
        description="Gérez les informations de l’entreprise, l’équipe, les rôles, les permissions, les notifications, la sécurité, la langue et l’apparence."
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
        title="Modules de configuration"
        description="Sections principales des paramètres de l’espace entreprise."
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
