'use client';

import { Avatar, DataTable, type DataTableColumn, PageHero, StatusBadge } from '@dala/ui-web';
import { useState } from 'react';

import { updateMemberRole } from './actions';

import { useAsyncTransition } from '@/lib/useAsyncTransition';

type Member = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: 'owner' | 'manager' | 'viewer';
  joined_at: string;
};

const ROLE_LABEL: Record<Member['role'], string> = {
  owner: 'Propriétaire',
  manager: 'Responsable',
  viewer: 'Observateur',
};

const ROLE_VARIANT: Record<Member['role'], 'success' | 'info' | 'neutral'> = {
  owner: 'success',
  manager: 'info',
  viewer: 'neutral',
};

export function RolesView({
  members,
  currentUserId,
  currentUserRole,
}: {
  members: Member[];
  currentUserId: string;
  currentUserRole: string;
}) {
  const [rows, setRows] = useState(members);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  const canEdit = currentUserRole === 'owner';

  function handleRoleChange(userId: string, newRole: 'manager' | 'viewer') {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole({ user_id: userId, role: newRole });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setRows((current) =>
        current.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)),
      );
    });
  }

  const columns: DataTableColumn<Member>[] = [
    {
      key: 'name',
      header: 'Membre',
      render: (m) => (
        <div className="flex items-center gap-3">
          <Avatar name={m.full_name} imageUrl={m.avatar_url ?? undefined} />
          <span className="font-medium">
            {m.full_name}
            {m.user_id === currentUserId && (
              <span className="ms-2 text-xs text-neutral-500">(vous)</span>
            )}
          </span>
        </div>
      ),
      sortValue: (m) => m.full_name,
    },
    {
      key: 'role',
      header: 'Rôle',
      render: (m) => {
        if (m.role === 'owner' || !canEdit || m.user_id === currentUserId) {
          return <StatusBadge variant={ROLE_VARIANT[m.role]}>{ROLE_LABEL[m.role]}</StatusBadge>;
        }
        return (
          <select
            value={m.role}
            disabled={isPending}
            onChange={(e) => handleRoleChange(m.user_id, e.target.value as 'manager' | 'viewer')}
            className="rounded-control bg-neutral-0 focus:border-accent-600 border border-neutral-300 px-2 py-1.5 text-sm outline-none"
          >
            <option value="manager">Responsable</option>
            <option value="viewer">Observateur</option>
          </select>
        );
      },
    },
  ];

  return (
    <>
      {/* Phase 20 (§1.7h) — extracted from the ad hoc <h1> in this
          screen's page.tsx, matching every other settings screen's
          pattern (PageHero lives in the client view, not the server
          page.tsx). */}
      <PageHero
        eyebrow="Équipe"
        title="Rôles & permissions"
        description="Gérez les rôles des membres de votre organisation."
      />
      {error && (
        <div className="border-danger/20 bg-danger/10 text-danger mb-4 rounded-2xl border px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {!canEdit && (
        <div className="mb-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
          Seul le propriétaire de l&apos;organisation peut modifier les rôles.
        </div>
      )}
      <DataTable columns={columns} rows={rows} getRowId={(m) => m.user_id} />
    </>
  );
}
