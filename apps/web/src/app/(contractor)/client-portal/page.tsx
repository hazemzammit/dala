import { HandshakeIcon } from '@phosphor-icons/react/ssr';
import { redirect } from 'next/navigation';

import { PageHeader, ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';

/**
 * Doc 06 §6.8 — "vue client filtrée". Aucune table invoices/payments/
 * client_reports n'existe en base, et aucun système d'authentification
 * client externe n'est en place (project_memberships.role='client' sert
 * pour une AUTRE organisation invitée, pas un client individuel externe).
 * Cet écran affiche donc un récapitulatif interne réel (chantiers actifs +
 * % budget consommé, déjà calculé pour l'écran Chantiers) plutôt qu'un vrai
 * portail accessible par le client — Factures/Paiements/Rapports partagés
 * restent "Bientôt disponible" jusqu'à ce que ces tables et un système
 * d'accès externe existent. Flagged for Hazem.
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
    : { data: [] };

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
      <PageHeader
        eyebrow="Accès client"
        title="Portail client"
        description="Récapitulatif de vos chantiers actifs, à partager avec vos clients."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="p-5" raised>
          <HandshakeIcon size={22} className="text-accent-700" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Chantiers ouverts
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {projectsWithProgress.length}
          </p>
        </Card>
        {[
          ['Factures envoyées', 'Bientôt disponible'],
          ['Paiements reçus', 'Bientôt disponible'],
          ['Rapports partagés', 'Bientôt disponible'],
        ].map(([label, value]) => (
          <Card key={label} className="p-5 opacity-60" raised>
            <HandshakeIcon size={22} className="text-neutral-400" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {label}
            </p>
            <p className="mt-2 text-sm text-neutral-500">{value}</p>
          </Card>
        ))}
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
              <div key={item.id}>
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
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Mises à jour client"
        description="Rapports partagés, événements de timeline et notes de facturation."
      >
        <p className="text-sm text-neutral-500">
          Bientôt disponible — nécessite un système de rapports partagés et de facturation, pas
          encore présent dans la base de données.
        </p>
      </SectionCard>
    </div>
  );
}
