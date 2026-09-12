'use client';

import {
  DataTable,
  type DataTableColumn,
  ErrorState,
  IconActionButton,
  StatusBadge,
} from '@dala/ui-web';
import { SignOutIcon } from '@phosphor-icons/react/ssr';
import { useEffect, useState } from 'react';

import { useAdminSession } from '@/lib/use-admin-session';

interface SessionRow {
  id: string;
  admin_id: string;
  admin_name: string;
  admin_role: string | null;
  created_at: string;
  last_active_at: string;
  expires_at: string;
  ip_address: string | null;
  is_impersonating: boolean;
  is_current: boolean;
}

/**
 * apps/admin/src/app/(admin)/admin-sessions/SessionsTable.tsx
 *
 * Admin remediation Tier 4.9. Self-service for everyone (the API already
 * scopes GET to just your own sessions unless you're a Super Admin — this
 * component doesn't need its own role branching to decide WHAT rows show,
 * only whether the "admin" column is worth displaying at all, which is
 * only meaningful once a Super Admin is looking at more than one admin's
 * rows).
 */
export function SessionsTable() {
  const { data: session } = useAdminSession();
  const isSuperAdmin = session?.admin.role === 'super_admin';

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — same gap as admin's OrganizationsTable: no
  // res.ok check on the primary fetch, no way to distinguish a failure
  // from a genuinely session-free result.
  const [loadError, setLoadError] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/admin/sessions');
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(sessionRow: SessionRow) {
    const confirmMessage = sessionRow.is_current
      ? 'Révoquer votre session actuelle vous déconnectera immédiatement. Continuer ?'
      : `Révoquer la session de ${sessionRow.admin_name} ?`;
    if (!window.confirm(confirmMessage)) return;

    setRevokingId(sessionRow.id);
    try {
      const res = await fetch('/api/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionRow.id, action: 'revoke' }),
      });
      if (res.ok) {
        if (sessionRow.is_current) {
          window.location.href = '/login';
          return;
        }
        await load();
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? 'Révocation impossible.');
      }
    } finally {
      setRevokingId(null);
    }
  }

  const columns: DataTableColumn<SessionRow>[] = [
    ...(isSuperAdmin
      ? [
          {
            key: 'admin_name',
            header: 'Admin',
            render: (s: SessionRow) => (
              <span className="text-neutral-900">
                {s.admin_name}
                {s.admin_role && (
                  <span className="ml-1 text-xs text-neutral-500">({s.admin_role})</span>
                )}
              </span>
            ),
          } as DataTableColumn<SessionRow>,
        ]
      : []),
    {
      key: 'created_at',
      header: 'Connectée depuis',
      render: (s) => new Date(s.created_at).toLocaleString('fr-FR'),
    },
    {
      key: 'last_active_at',
      header: 'Dernière activité',
      sortValue: (s) => s.last_active_at,
      render: (s) => new Date(s.last_active_at).toLocaleString('fr-FR'),
    },
    { key: 'ip_address', header: 'IP', render: (s) => s.ip_address ?? '—' },
    {
      key: 'status',
      header: '',
      render: (s) => (
        <div className="flex items-center gap-2">
          {s.is_current && <StatusBadge variant="info">Session actuelle</StatusBadge>}
          {s.is_impersonating && <StatusBadge variant="warning">Impersonation active</StatusBadge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <IconActionButton
          icon={SignOutIcon}
          label="Révoquer"
          tone="danger"
          size="sm"
          disabled={revokingId === s.id}
          onClick={() => revoke(s)}
        />
      ),
    },
  ];

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;
  if (loadError) return <ErrorState onRetry={() => void load()} />;

  return <DataTable columns={columns} rows={sessions} getRowId={(s) => s.id} />;
}
