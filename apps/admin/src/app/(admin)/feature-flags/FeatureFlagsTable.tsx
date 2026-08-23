'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { useAdminSession } from '@/lib/use-admin-session';

interface Flag {
  key: string;
  description: string;
  default_enabled: boolean;
  updated_at: string;
}

interface Override {
  org_id: string;
  org_name: string;
  enabled: boolean;
  updated_at: string;
}

function OverridesPanel({ flagKey, canEdit }: { flagKey: string; canEdit: boolean }) {
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState('');
  const [enabled, setEnabled] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/feature-flags/${flagKey}/overrides`);
    const data = await res.json();
    setOverrides(data.overrides ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagKey]);

  async function addOverride() {
    if (!orgId.trim()) return;
    await fetch(`/api/admin/feature-flags/${flagKey}/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: orgId.trim(), action: 'set', enabled }),
    });
    setOrgId('');
    await load();
  }

  async function clearOverride(targetOrgId: string) {
    await fetch(`/api/admin/feature-flags/${flagKey}/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: targetOrgId, action: 'clear' }),
    });
    await load();
  }

  return (
    <div className="mt-3 border-t border-neutral-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-[0.04em] text-neutral-500">
        Surcharges par organisation
      </p>

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="w-64">
            <FormField
              label="ID de l'organisation"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="uuid de l'organisation"
            />
          </div>
          <select
            value={enabled ? 'true' : 'false'}
            onChange={(e) => setEnabled(e.target.value === 'true')}
            className="rounded-control focus:border-accent-600 border border-neutral-300 px-3 py-2.5 text-sm outline-none"
          >
            <option value="true">Activé</option>
            <option value="false">Désactivé</option>
          </select>
          <Button onClick={addOverride} disabled={!orgId.trim()} className="px-3 py-2 text-xs">
            Ajouter la surcharge
          </Button>
        </div>
      )}

      <div className="mt-3 space-y-1.5">
        {loading ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : overrides.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Aucune surcharge — la valeur par défaut s'applique partout.
          </p>
        ) : (
          overrides.map((o) => (
            <div key={o.org_id} className="flex items-center justify-between text-sm">
              <span className="text-neutral-900">
                {o.org_name} —{' '}
                <span className={o.enabled ? 'text-success' : 'text-danger'}>
                  {o.enabled ? 'Activé' : 'Désactivé'}
                </span>
              </span>
              {canEdit && (
                <button
                  onClick={() => clearOverride(o.org_id)}
                  className="text-xs font-medium text-neutral-500 hover:underline"
                >
                  Retirer
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function FeatureFlagsTable() {
  const { data: session } = useAdminSession();
  const canEdit = session?.admin.role === 'super_admin' || session?.admin.role === 'admin';

  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDefault, setNewDefault] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/feature-flags');
    const data = await res.json();
    setFlags(data.flags ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleDefault(flag: Flag) {
    await fetch(`/api/admin/feature-flags/${flag.key}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultEnabled: !flag.default_enabled }),
    });
    await load();
  }

  async function deleteFlag(key: string) {
    if (
      !window.confirm(
        `Supprimer le flag "${key}" ? Toutes ses surcharges par organisation seront aussi supprimées.`,
      )
    ) {
      return;
    }
    await fetch(`/api/admin/feature-flags/${key}`, { method: 'DELETE' });
    await load();
  }

  async function createFlag() {
    setCreateError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newKey,
          description: newDescription,
          defaultEnabled: newDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? 'Création impossible.');
        return;
      }
      setNewKey('');
      setNewDescription('');
      setNewDefault(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card className="p-6">
          <h3 className="font-display text-base font-semibold text-neutral-900">Nouveau flag</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              label="Clé (snake_case)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="nouveau_tableau_de_bord"
            />
            <div className="sm:col-span-2">
              <FormField
                label="Description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="À quoi sert ce flag"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-900">
            <input
              type="checkbox"
              checked={newDefault}
              onChange={(e) => setNewDefault(e.target.checked)}
            />
            Activé par défaut pour toutes les organisations
          </label>
          {createError && <p className="text-danger mt-2 text-sm">{createError}</p>}
          <div className="mt-3 flex justify-end">
            <Button onClick={createFlag} disabled={!newKey || !newDescription} loading={submitting}>
              Créer
            </Button>
          </div>
        </Card>
      )}

      {flags.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun feature flag pour le moment.</p>
      ) : (
        flags.map((flag) => (
          <Card key={flag.key} className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-sm font-semibold text-neutral-900">{flag.key}</p>
                <p className="mt-1 text-sm text-neutral-500">{flag.description}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                  <input
                    type="checkbox"
                    checked={flag.default_enabled}
                    onChange={() => toggleDefault(flag)}
                    disabled={!canEdit}
                  />
                  Par défaut
                </label>
                {canEdit && (
                  <button
                    onClick={() => deleteFlag(flag.key)}
                    className="text-danger text-xs font-medium hover:underline"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setExpandedKey(expandedKey === flag.key ? null : flag.key)}
              className="text-accent-700 mt-3 text-xs font-medium hover:underline"
            >
              {expandedKey === flag.key
                ? 'Masquer les surcharges'
                : 'Gérer les surcharges par organisation'}
            </button>

            {expandedKey === flag.key && <OverridesPanel flagKey={flag.key} canEdit={canEdit} />}
          </Card>
        ))
      )}
    </div>
  );
}
