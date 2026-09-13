'use client';

import { ErrorState, Skeleton, StatusBadge } from '@dala/ui-web';
import { useEffect, useState } from 'react';

interface HealthCheck {
  id: string;
  service_name: string;
  status: 'up' | 'down';
  latency_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

interface ServiceStatus {
  service_name: string;
  latest: HealthCheck | null;
}

// Doc 06 §6.3 — display labels for the services actually checked
// (migration 0032; supabase_realtime added by 0056). Konnect is
// intentionally excluded — see that migration's header for why (no
// existing Konnect integration code in this repo to base a real check on).
const SERVICE_LABELS: Record<string, string> = {
  supabase_auth: 'Supabase Auth',
  supabase_storage: 'Supabase Storage',
  supabase_realtime: 'Temps réel (Realtime)',
  resend: 'Resend',
  expo_push: 'Expo Push',
};

/**
 * apps/admin/src/app/(admin)/services-health/InfraStatusGrid.tsx
 *
 * Doc 06 §6.3 — infrastructure status grid. Real as of migration 0032:
 * each card reflects the most recent row in `service_health_checks`,
 * written every 5 minutes by ping-service-health (a real reachability
 * ping against each service, not a simulated result — see that
 * function's header for exactly what each check does).
 */
export function InfraStatusGrid() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — this grid has no EmptyState/DataTable slot at
  // all: a failed fetch previously rendered as a silently-empty grid,
  // with no message of any kind, not even an ambiguous one.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/services-health')
      .then((res) => {
        if (!res.ok) throw new Error('request failed');
        return res.json();
      })
      .then((data) => setServices(data.services ?? []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  // Phase 5 (§5.10) — card grid keeps its shape while loading: shared
  // Skeleton bars inside the existing grid + Card structure (plan §2.15
  // "a couple of Skeleton bars for smaller sections"). No new component.
  if (loading) {
    return (
      <div
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
        aria-busy="true"
        aria-label="Chargement…"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-control border border-neutral-200 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-6 w-1/2 rounded-full" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }
  if (loadError) return <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />;

  // Phase 4.7 (§5 Services-Health item) — per-service tiles de-elevated from
  // Card to plain tiles (rounded-control, hairline border, no shadow): the
  // parent SectionCard in page.tsx already supplies the one raised boundary
  // for this section. Loading skeletons + the Konnect tile share the same
  // tile shape (Konnect keeps border-dashed: the unmonitored-placeholder
  // signal is deliberate).
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {services.map((s) => {
        const check = s.latest;
        const staleThresholdMs = 15 * 60 * 1000; // 3 missed 5-min ticks
        const isStale =
          check && Date.now() - new Date(check.checked_at).getTime() > staleThresholdMs;

        return (
          <div key={s.service_name} className="rounded-control border border-neutral-200 p-4">
            <p className="text-sm font-medium text-neutral-900">
              {SERVICE_LABELS[s.service_name] ?? s.service_name}
            </p>
            <div className="mt-2">
              {!check ? (
                <StatusBadge variant="neutral">Jamais vérifié</StatusBadge>
              ) : isStale ? (
                /* Phase 5 (§5.10) — stale data escalates past plain warning
                   via the shared warningStrong tier (§5.9); text unchanged. */
                <StatusBadge variant="warningStrong">Données obsolètes</StatusBadge>
              ) : check.status === 'up' ? (
                <StatusBadge variant="success">Opérationnel</StatusBadge>
              ) : (
                <StatusBadge variant="danger">Indisponible</StatusBadge>
              )}
            </div>
            {check && (
              <p className="mt-2 text-xs text-neutral-500">
                {check.latency_ms != null && `${check.latency_ms} ms · `}
                {new Date(check.checked_at).toLocaleTimeString('fr-FR')}
              </p>
            )}
            {check?.error_message && (
              <p className="text-danger mt-1 line-clamp-2 text-xs">{check.error_message}</p>
            )}
          </div>
        );
      })}
      <div className="rounded-control border border-dashed border-neutral-200 p-4">
        <p className="text-sm font-medium text-neutral-500">Konnect</p>
        <div className="mt-2">
          <StatusBadge variant="neutral">Non surveillé</StatusBadge>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Aucune intégration Konnect existante à sonder (Billing/paiements reste hors périmètre).
        </p>
      </div>
    </div>
  );
}
