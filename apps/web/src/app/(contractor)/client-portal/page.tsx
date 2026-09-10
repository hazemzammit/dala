import { Card } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { HandshakeIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/server';

/**
 * Doc 06 §6.8 — "vue client filtrée". Aucun système d'authentification
 * client externe n'est en place (project_memberships.role='client' sert
 * pour une AUTRE organisation invitée, pas un client individuel externe).
 * Cet écran affiche donc un récapitulatif interne réel (chantiers actifs,
 * factures, paiements) plutôt qu'un vrai portail accessible par le client
 * lui-même — "Rapports partagés" reste "Bientôt disponible" (aucune table
 * pour ça). Flagged for Hazem pour le vrai accès externe.
 */
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

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, client_name, budget_total, status')
    .eq('lead_org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active')
    .order('name');

  const projectIds = (projects ?? []).map((p) => p.id);

  const { data: expenses } = projectIds.length
    ? await supabase
        .from('project_expenses')
        .select('project_id, amount')
        .in('project_id', projectIds)
        .is('deleted_at', null)
    : { data: [] };

  // FLAGGED FOR HAZEM — same schema mismatch already found in
  // projects/getProjectDashboard.ts: `invoices` has no `status` column at
  // all (migration 0074 — deliberately, per that migration's own comment).
  // The original version here selected `status` and filtered
  // `.status === 'paid'` for "Paiements reçus", which doesn't exist as a
  // concept this schema can express yet. Now just counts all invoices sent
  // and labels the second stat honestly rather than implying a paid/unpaid
  // distinction the data can't back up.
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, subtotal')
    .eq('org_id', orgId);

  const invoiceCount = (invoices ?? []).length;
  const invoicedTotal = (invoices ?? []).reduce((sum, inv) => sum + Number(inv.subtotal), 0);

  const spentByProject = new Map<string, number>();
  for (const exp of expenses ?? []) {
    spentByProject.set(exp.project_id, (spentByProject.get(exp.project_id) ?? 0) + exp.amount);
  }

  const projectsWithProgress = (projects ?? []).map((p) => {
    const spent = spentByProject.get(p.id) ?? 0;
    const progress =
      p.budget_total && p.budget_total > 0
        ? Math.min(100, Math.round((spent / p.budget_total) * 100))
        : 0;
    return { ...p, progress };
  });

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        eyebrow="Accès client"
        title="Portail client"
        description="Récapitulatif de vos chantiers actifs, à partager avec vos clients."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Link href="/projects">
          <Card className="hover:border-accent-300 p-5 transition-colors" raised>
            <HandshakeIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Chantiers ouverts
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {projectsWithProgress.length}
            </p>
          </Card>
        </Link>

        <Link href="/billing">
          <Card className="hover:border-accent-300 p-5 transition-colors" raised>
            <HandshakeIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Factures envoyées
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {invoiceCount}
            </p>
          </Card>
        </Link>

        <Link href="/billing">
          <Card className="hover:border-accent-300 p-5 transition-colors" raised>
            <HandshakeIcon size={22} className="text-accent-700" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Montant facturé
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {invoicedTotal.toLocaleString('fr-TN')} TND
            </p>
          </Card>
        </Link>

        <Card className="p-5 opacity-60" raised>
          <HandshakeIcon size={22} className="text-neutral-400" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Rapports partagés
          </p>
          <p className="mt-2 text-sm text-neutral-500">Bientôt disponible</p>
        </Card>
      </div>

      <SectionCard
        title="Avancement des chantiers"
        description="% de budget consommé par chantier actif (donnée réelle, calculée depuis les dépenses enregistrées)."
      >
        {projectsWithProgress.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun chantier actif pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {projectsWithProgress.map((item) => (
              <Link key={item.id} href="/projects" className="block hover:opacity-80">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-900">
                    {item.name}
                    {item.client_name && (
                      <span className="ms-2 text-neutral-500">· {item.client_name}</span>
                    )}
                  </span>
                  <span className="text-neutral-500">{item.progress}%</span>
                </div>
                <ProgressBar
                  value={item.progress}
                  tone={item.progress > 80 ? 'success' : 'accent'}
                />
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Mises à jour client"
        description="Rapports partagés, événements de timeline et notes de facturation."
      >
        <p className="text-sm text-neutral-500">
          Bientôt disponible — nécessite un système de rapports partagés, pas encore présent dans la
          base de données.
        </p>
      </SectionCard>
    </div>
  );
}
