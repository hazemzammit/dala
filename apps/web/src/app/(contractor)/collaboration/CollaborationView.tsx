'use client';

import { PlusIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { InviteOrgModal } from './InviteOrgModal';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';


type LedProject = { id: string; name: string; client_name: string | null };
type Membership = {
  id: string;
  project_id: string;
  budget_rollup_opt_in: boolean;
  organizations: { name: string } | null;
};
type PendingInvite = {
  id: string;
  project_id: string;
  invited_org_name: string;
  invited_contact_phone: string;
  role: 'trade' | 'client';
  status: string;
};
type TradeMembership = {
  id: string;
  project_id: string;
  budget_rollup_opt_in: boolean;
  projects: { id: string; name: string; client_name: string | null; lead_org_id: string } | null;
};
type LeadOrg = { id: string; name: string };

export function CollaborationView({
  ledProjects,
  memberships,
  pendingInvites,
  tradeMemberships,
  leadOrgs,
}: {
  ledProjects: LedProject[];
  memberships: Membership[];
  pendingInvites: PendingInvite[];
  tradeMemberships: TradeMembership[];
  leadOrgs: LeadOrg[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const leadOrgNameById = new Map(leadOrgs.map((o) => [o.id, o.name]));
  const isEmpty = ledProjects.length === 0 && tradeMemberships.length === 0;

  if (isEmpty) {
    return (
      <div className="p-8">
        <EmptyState
          icon={UsersThreeIcon}
          title="Aucune collaboration inter-entreprises"
          description="Créez un chantier pour pouvoir inviter une entreprise partenaire, ou vous verrez ici les chantiers auxquels une autre entreprise vous invite."
        />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-neutral-900">Collaboration</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Coordonnez plusieurs corps de métier sur un même chantier.
          </p>
        </div>
        {ledProjects.length > 0 && (
          <Button onClick={() => setModalOpen(true)}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Inviter une entreprise
          </Button>
        )}
      </div>

      {ledProjects.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Mes chantiers partagés
          </h2>
          <div className="flex flex-col gap-3">
            {ledProjects.map((project) => {
              const projectMembers = memberships.filter((m) => m.project_id === project.id);
              const projectInvites = pendingInvites.filter((i) => i.project_id === project.id);
              return (
                <Card key={project.id} className="p-4">
                  <p className="font-medium text-neutral-900">{project.name}</p>

                  {projectMembers.length === 0 && projectInvites.length === 0 && (
                    <p className="mt-2 text-sm text-neutral-500">
                      Aucune entreprise invitée sur ce chantier.
                    </p>
                  )}

                  <div className="mt-3 flex flex-col gap-2">
                    {projectMembers.map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={m.organizations?.name ?? '—'} size={28} />
                          <span className="text-sm">{m.organizations?.name ?? '—'}</span>
                        </div>
                        <StatusBadge variant={m.budget_rollup_opt_in ? 'success' : 'neutral'}>
                          {m.budget_rollup_opt_in ? 'Budget partagé' : 'Budget privé'}
                        </StatusBadge>
                      </div>
                    ))}
                    {projectInvites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between">
                        <span className="text-sm text-neutral-500">
                          {inv.invited_org_name} · {inv.invited_contact_phone}
                        </span>
                        <StatusBadge variant="warning">Invitation envoyée</StatusBadge>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tradeMemberships.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Chantiers auxquels je participe
          </h2>
          <div className="flex flex-col gap-3">
            {tradeMemberships.map((m) => (
              <Card key={m.id} className="p-4">
                <p className="font-medium text-neutral-900">{m.projects?.name ?? '—'}</p>
                <p className="mt-0.5 text-sm text-neutral-500">
                  Chantier dirigé par {leadOrgNameById.get(m.projects?.lead_org_id ?? '') ?? '—'}
                </p>
                {/* Doc 02 §2.8 — le partage de budget par l'entreprise invitée
                    n'est pas encore modifiable ici : la policy RLS actuelle
                    (migration 0006) réserve l'écriture sur project_memberships
                    au propriétaire/responsable du chantier qui dirige, pas à
                    l'entreprise invitée elle-même. Affiché en lecture seule ;
                    une nouvelle policy RLS serait nécessaire pour le rendre
                    modifiable. */}
                <div className="mt-3">
                  <StatusBadge variant={m.budget_rollup_opt_in ? 'success' : 'neutral'}>
                    {m.budget_rollup_opt_in ? 'Vous partagez votre budget' : 'Budget non partagé'}
                  </StatusBadge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {modalOpen && <InviteOrgModal projects={ledProjects} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
