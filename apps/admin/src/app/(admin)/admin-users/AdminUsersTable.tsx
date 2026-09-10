'use client';

import {
  Button,
  Card,
  ConfirmTypingDialog,
  DataTable,
  type DataTableColumn,
  ErrorState,
  FormField,
  StatusBadge,
} from '@dala/ui-web';
import { useEffect, useState } from 'react';

import { useAdminSession } from '@/lib/use-admin-session';

interface AdminRow {
  id: string;
  full_name: string;
  email: string | null;
  role: 'super_admin' | 'admin' | 'support';
  totp_enabled: boolean;
  last_login_at: string | null;
}

const ROLE_LABELS: Record<AdminRow['role'], string> = {
  support: 'Support',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export function AdminUsersTable() {
  const { data: session } = useAdminSession();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminRow['role']>('support');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminRow | null>(null);
  // Phase 20 (§1.7a) — this fetch had no error handling at all: a
  // failed load silently left `admins` at its initial empty array, with
  // no loading state or empty-state message to distinguish it from a
  // genuinely admin-free org (which shouldn't even be possible here,
  // but the ambiguity was still real on a real failure).
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setLoadError(false);
    try {
      const res = await fetch('/api/admin/admins');
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setAdmins(data.admins ?? []);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Impossible d'inviter cet admin.");
        return;
      }
      setEmail('');
      setFullName('');
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const isSuperAdmin = session?.admin.role === 'super_admin';

  async function resetTotp() {
    if (!resetTarget) return;
    const res = await fetch(`/api/admin/admins/${resetTarget.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_totp' }),
    });
    const data = await res.json().catch(() => null);
    setResetTarget(null);
    if (res.ok) {
      await load();
    } else {
      alert(data?.error ?? 'Impossible de réinitialiser la 2FA de cet admin.');
    }
  }

  const columns: DataTableColumn<AdminRow>[] = [
    { key: 'name', header: 'Nom', render: (a) => a.full_name },
    {
      key: 'role',
      header: 'Rôle',
      render: (a) => <StatusBadge variant="info">{ROLE_LABELS[a.role]}</StatusBadge>,
    },
    {
      key: 'totp',
      header: '2FA',
      render: (a) =>
        a.totp_enabled ? (
          <StatusBadge variant="success">Activée</StatusBadge>
        ) : (
          <StatusBadge variant="neutral">Non configurée</StatusBadge>
        ),
    },
    {
      key: 'last_login_at',
      header: 'Dernière connexion',
      render: (a) =>
        a.last_login_at ? new Date(a.last_login_at).toLocaleDateString('fr-FR') : '—',
    },
    {
      // Doc 04 §4.3.1 edge case / §4.3.11 — locked-out admin recovery.
      // Only Super Admin sees this, only when the target actually has
      // TOTP enabled (nothing to reset otherwise), and never for the
      // acting admin's own row (mirrors the route's own self-reset
      // guard — disabling it here too rather than letting someone click
      // it and only find out server-side that it's blocked).
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        isSuperAdmin && a.totp_enabled && a.id !== session?.admin.id ? (
          <button
            onClick={() => setResetTarget(a)}
            className="text-danger text-xs font-medium hover:underline"
          >
            Réinitialiser 2FA
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      {loadError ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <DataTable columns={columns} rows={admins} getRowId={(a) => a.id} />
      )}

      {isSuperAdmin && (
        <Card className="max-w-md p-6">
          <form onSubmit={invite} className="space-y-4">
            <h2 className="font-display text-base font-semibold text-neutral-900">
              Inviter un admin
            </h2>
            <FormField
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <FormField
              label="Nom complet"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <div>
              <label className="text-sm font-medium text-neutral-900">Rôle</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as AdminRow['role'])}
                className="rounded-control focus:border-accent-600 mt-1 w-full border border-neutral-300 px-3 py-2.5 text-sm outline-none"
              >
                <option value="support">Support</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
            {error && <p className="text-danger text-sm">{error}</p>}
            <Button type="submit" fullWidth loading={submitting}>
              Envoyer l'invitation
            </Button>
          </form>
        </Card>
      )}

      {resetTarget && (
        <ConfirmTypingDialog
          title="Réinitialiser la 2FA"
          description={`${resetTarget.full_name} devra reconfigurer son authentificateur à sa prochaine connexion. Cette action est journalisée dans le journal d'audit.`}
          confirmValue={resetTarget.email ?? resetTarget.full_name}
          confirmLabel="Réinitialiser"
          onConfirm={resetTotp}
          onCancel={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
