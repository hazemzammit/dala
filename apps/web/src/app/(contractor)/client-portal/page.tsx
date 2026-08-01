import { HandshakeIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, ProgressBar, SectionCard, TimelineList } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Accès client"
        title="Portail client"
        description="Offrez aux clients une vue ciblée sur l’avancement, les factures, les rapports et les mises à jour."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ['Chantiers ouverts', '5'],
          ['Factures envoyées', '12'],
          ['Paiements reçus', '9'],
          ['Rapports partagés', '18'],
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
        title="Avancement des chantiers"
        description="Vue en direct pour les clients sur le portefeuille actuel."
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
        title="Mises à jour client"
        description="Rapports partagés, événements de timeline et notes de facturation."
      >
        <TimelineList
          items={[
            {
              title: 'Rapport mensuel partagé',
              description: 'Le client a reçu le dernier résumé PDF.',
              time: 'Yesterday',
              tone: 'success',
            },
            {
              title: 'Rappel de facture envoyé',
              description: 'Deux rappels de paiement attendent encore une confirmation.',
              time: 'Today',
              tone: 'warning',
            },
            {
              title: 'Album photo mis à jour',
              description: 'Douze nouvelles photos de chantier ont été ajoutées pour révision.',
              time: 'Today',
              tone: 'accent',
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
