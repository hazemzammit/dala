'use client';

import {
  Button,
  ErrorState,
  FormField,
  IconActionButton,
  SectionCard,
  TableSkeleton,
} from '@dala/ui-web';
import { TrashIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

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
  // Phase 20 (§1.7a) — no res.ok check on the primary flags fetch (the
  // per-flag overrides panel's own plain-disabled pattern is unrelated
  // and stays exactly as-is — the sanctioned exception noted in Step 0).
  const [loadError, setLoadError] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDefault, setNewDefault] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/admin/feature-flags');
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const data = await res.json();
      setFlags(data.flags ?? []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
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

  // Phase 5 (§5.12) — same loading treatment as Billing/Storage/Users.
  if (loading) return <TableSkeleton />;
  if (loadError) return <ErrorState onRetry={() => void load()} />;

  return (
    <div className="space-y-4">
      {canEdit && (
        // Phase 5 (§5.12) — create-form Card becomes a tone-less SectionCard
        // (Level-1 surface per Phase 4.6): title moves from the inner <h3>
        // into the SectionCard title, everything else unchanged.
        <SectionCard title="Nouveau flag">
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
        </SectionCard>
      )}

      {flags.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun feature flag pour le moment.</p>
      ) : (
        flags.map((flag) => (
          // Phase 5 (§5.12) — per-flag Card becomes a tone-less SectionCard:
          // the mono key moves from the inner header into the SectionCard
          // title; "Par défaut" checkbox, expander, and override caption
          // unchanged. Only the per-flag Supprimer converts to an icon
          // button (label verbatim); the override-row Retirer stays a text
          // button (different action, neutral treatment, untouched).
          <SectionCard key={flag.key} title={flag.key}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-neutral-500">{flag.description}</p>
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
                {/* Step 14 (§5 Services-health/sessions-size pass) — the
                  per-flag Supprimer button had an explicit size="sm";
                  removed to fall back to the shared md default, matching
                  every other table's row-action size per the DoD. */}
                {canEdit && (
                  <IconActionButton
                    icon={TrashIcon}
                    label="Supprimer"
                    tone="danger"
                    onClick={() => deleteFlag(flag.key)}
                  />
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
          </SectionCard>
        ))
      )}
    </div>
  );
}
