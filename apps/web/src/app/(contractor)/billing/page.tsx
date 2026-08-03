import { ReceiptIcon } from '@phosphor-icons/react/ssr';
import { redirect } from 'next/navigation';

import { BillingView } from './BillingView';

import { PageHeader } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';


export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_org_id) redirect('/create-organization');

  const orgId = profile.active_org_id;

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, project_id, invoice_number, client_name, amount, status, due_date, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .order('name');

  const totalOverdue = (invoices ?? [])
    .filter((inv) => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Finance"
        title="Facturation"
        description="Suivez les factures et les paiements de vos chantiers."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="p-5" raised>
          <ReceiptIcon size={22} className="text-accent-700" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Factures
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {(invoices ?? []).length}
          </p>
        </Card>
        <Card className="p-5" raised>
          <ReceiptIcon size={22} className="text-accent-700" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Payées
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {(invoices ?? []).filter((i) => i.status === 'paid').length}
          </p>
        </Card>
        <Card className="p-5 opacity-60" raised>
          <ReceiptIcon size={22} className="text-neutral-400" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Abonnements
          </p>
          <p className="mt-2 text-sm text-neutral-500">Bientôt disponible</p>
        </Card>
        <Card className="p-5" raised>
          <ReceiptIcon size={22} className="text-warning" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Solde en retard
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {totalOverdue.toLocaleString('fr-TN')} TND
          </p>
        </Card>
      </div>

      <BillingView invoices={invoices ?? []} projects={projects ?? []} />
    </div>
  );
}
