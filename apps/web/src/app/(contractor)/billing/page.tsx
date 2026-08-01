import { ReceiptIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, SectionCard, TimelineList } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Finance"
        title="Facturation"
        description="Suivez les factures, les paiements, les abonnements et l’historique des transactions."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ['Factures', '28'],
          ['Paiements', '22'],
          ['Abonnements', 'Actif'],
          ['Solde en retard', '12 600 TND'],
        ].map(([label, value]) => (
          <Card key={label} className="p-5" raised>
            <ReceiptIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
          </Card>
        ))}
      </div>

      <SectionCard
        title="Transactions"
        description="Historique récent des factures et des paiements."
      >
        <TimelineList
          items={[
            {
              title: 'Facture n°1042 réglée',
              description: 'El Baraka Residence a réglé le 3e paiement d’avancement.',
              time: '09:20',
              tone: 'success',
            },
            {
              title: 'Facture n°1043 envoyée',
              description: 'L’email de facturation client pour Coastal Villas a bien été délivré.',
              time: '11:10',
              tone: 'accent',
            },
            {
              title: 'Rappel de retard',
              description: 'Le rappel de paiement pour School Annex est programmé pour demain.',
              time: '16:40',
              tone: 'warning',
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
