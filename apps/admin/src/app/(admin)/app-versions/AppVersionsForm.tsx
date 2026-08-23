'use client';

import { WarningIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { useAdminSession } from '@/lib/use-admin-session';

interface VersionRow {
  platform: 'ios' | 'android';
  latest_version: string;
  min_supported_version: string;
  updated_at: string;
}

const PLATFORM_LABELS: Record<VersionRow['platform'], string> = {
  ios: 'iOS',
  android: 'Android',
};

function PlatformCard({
  version,
  canEdit,
  onSaved,
}: {
  version: VersionRow;
  canEdit: boolean;
  onSaved: (updated: VersionRow) => void;
}) {
  const [latestVersion, setLatestVersion] = useState(version.latest_version);
  const [minSupportedVersion, setMinSupportedVersion] = useState(version.min_supported_version);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    latestVersion !== version.latest_version ||
    minSupportedVersion !== version.min_supported_version;

  async function handleSave() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/app-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: version.platform,
          latestVersion,
          minSupportedVersion,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Mise à jour impossible.');
        return;
      }
      onSaved(data.version);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h3 className="font-display text-base font-semibold text-neutral-900">
        {PLATFORM_LABELS[version.platform]}
      </h3>
      <p className="mt-1 text-xs text-neutral-500">
        Mis à jour le {new Date(version.updated_at).toLocaleString('fr-FR')}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Dernière version"
          value={latestVersion}
          onChange={(e) => setLatestVersion(e.target.value)}
          disabled={!canEdit}
          placeholder="1.4.2"
        />
        <FormField
          label="Version minimale supportée"
          value={minSupportedVersion}
          onChange={(e) => setMinSupportedVersion(e.target.value)}
          disabled={!canEdit}
          placeholder="1.3.0"
        />
      </div>

      {/* Doc 01 §1.8.2 — this is literally the "kill a bad release" lever:
          raising min_supported_version above what real users still have
          installed hard-blocks them on next cold start
          (app_version_check(), 0011). No client-reported-version column
          exists anywhere in this schema (checked profiles and every
          later migration before writing this) — so this warns about the
          blast radius in words rather than showing a fabricated "N users
          affected" count it has no real data to back. */}
      {minSupportedVersion !== version.min_supported_version && (
        <div className="border-warning/30 bg-warning/10 mt-4 flex items-start gap-2 rounded-md border p-3">
          <WarningIcon size={18} className="text-warning mt-0.5 shrink-0" weight="fill" />
          <p className="text-sm text-neutral-900">
            Relever la version minimale supportée bloquera immédiatement, au prochain démarrage,
            tout utilisateur dont l'application installée est en dessous de cette version — sans
            confirmation possible pour eux. Le nombre exact d'utilisateurs concernés n'est pas
            calculable ici (aucune version d'app n'est actuellement enregistrée côté profil) ;
            vérifiez ailleurs (Sentry, App Store Connect, Play Console) avant de confirmer.
          </p>
        </div>
      )}

      {error && <p className="text-danger mt-3 text-sm">{error}</p>}

      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={!dirty} loading={submitting}>
            Enregistrer
          </Button>
        </div>
      )}
    </Card>
  );
}

export function AppVersionsForm() {
  const { data: session } = useAdminSession();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Support is read-only here — the route's own POST role gate is the
  // real enforcement; this only avoids showing an edit affordance that
  // would just 403 if used.
  const canEdit = session?.admin.role === 'super_admin' || session?.admin.role === 'admin';

  async function load() {
    setLoading(true);
    const res = await fetch('/api/admin/app-versions');
    const data = await res.json();
    setVersions(data.versions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleSaved(updated: VersionRow) {
    setVersions((prev) => prev.map((v) => (v.platform === updated.platform ? updated : v)));
  }

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {versions.map((v) => (
        <PlatformCard key={v.platform} version={v} canEdit={canEdit} onSaved={handleSaved} />
      ))}
    </div>
  );
}
