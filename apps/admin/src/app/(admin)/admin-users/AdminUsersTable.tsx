'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { FormField } from '@/components/ui/FormField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAdminSession } from '@/lib/use-admin-session';

interface AdminRow {
  id: string;
  full_name: string;
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

  async function load() {
    const res = await fetch('/api/admin/admins');
    const data = await res.json();
    setAdmins(data.admins ?? []);
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
  ];

  return (
    <div className="space-y-6">
      <DataTable columns={columns} rows={admins} getRowId={(a) => a.id} />

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
    </div>
  );
}
