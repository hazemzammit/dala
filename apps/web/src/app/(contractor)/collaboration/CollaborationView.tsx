'use client';

import { PlusIcon, UsersThreeIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { InviteOrgModal } from './InviteOrgModal';

import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';


type Project = { id: string; name: string };

type Invitation = {
  id: string;
  project_id: string;
  invited_org_name: string;
  invited_contact_phone: string;
  role: 'trade' | 'client';
  status: 'pending' | 'accepted' | 'expired';
  sent_at: string;
  expires_at: string;
};

const ROLE_LABEL: Record<Invitation['role'], string> = {
  trade: 'Corps de métier',
  client: 'Client',
};

const STATUS_LABEL: Record<Invitation['status'], string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  expired: 'Expirée',
};

const STATUS_VARIANT: Record<Invitation['status'], 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'neutral',
};

export function CollaborationView({
  projects,
  invitations,
}: {
  projects: Project[];
  invitations: Invitation[];
}) {
  const [modalOpen, setModalOpen] = useState(false);

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  const columns: DataTableColumn<Invitation>[] = [
    {
      key: 'invited_org_name',
      header: 'Entreprise invitée',
      render: (i) => <span className="font-medium">{i.invited_org_name}</span>,
      sortValue: (i) => i.invited_org_name,
    },
    {
      key: 'project',
      header: 'Chantier',
      render: (i) => projectNameById.get(i.project_id) ?? '—',
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (i) => ROLE_LABEL[i.role],
    },
    {
      key: 'phone',
      header: 'Téléphone',
      render: (i) => i.invited_contact_phone,
    },
    {
      key: 'status',
      header: 'Statut',
      render: (i) => (
        <StatusBadge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</StatusBadge>
      ),
      sortValue: (i) => i.status,
    },
  ];

  return (
    <>
      {projects.length === 0 ? (
        <EmptyState
          icon={UsersThreeIcon}
          title="Créez d'abord un chantier"
          description="Vous devez avoir au moins un chantier actif pour inviter une entreprise partenaire."
          actionLabel="Aller aux chantiers"
          actionHref="/projects"
        />
      ) : invitations.length === 0 ? (
        <EmptyState
          icon={UsersThreeIcon}
          title="Aucune invitation envoyée"
          description="Invitez une entreprise partenaire (corps de métier ou client) à collaborer sur un chantier."
          actionLabel="Inviter une entreprise"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setModalOpen(true)}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Inviter une entreprise
            </Button>
          </div>
          <DataTable columns={columns} rows={invitations} getRowId={(i) => i.id} />
        </>
      )}

      {modalOpen && <InviteOrgModal projects={projects} onClose={() => setModalOpen(false)} />}
    </>
  );
}
