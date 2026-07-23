import { ReceiptIcon } from '@phosphor-icons/react/ssr';

import { PageHeader, SectionCard, TimelineList } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';

export default function Page() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Finance"
        title="Billing"
        description="Track invoices, payments, subscriptions, and transaction history."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          ['Invoices', '28'],
          ['Payments', '22'],
          ['Subscriptions', 'Active'],
          ['Overdue balance', '12,600 TND'],
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

      <SectionCard title="Transactions" description="Recent invoice and payment history.">
        <TimelineList
          items={[
            {
              title: 'Invoice #1042 paid',
              description: 'El Baraka Residence settled the 3rd progress payment.',
              time: '09:20',
              tone: 'success',
            },
            {
              title: 'Invoice #1043 sent',
              description: 'Coastal Villas client billing email delivered.',
              time: '11:10',
              tone: 'accent',
            },
            {
              title: 'Overdue reminder',
              description: 'School Annex payment reminder scheduled for tomorrow.',
              time: '16:40',
              tone: 'warning',
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}
