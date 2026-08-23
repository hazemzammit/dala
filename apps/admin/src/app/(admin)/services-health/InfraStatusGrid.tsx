'use client';

import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';

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

  useEffect(() => {
    fetch('/api/admin/services-health')
      .then((res) => res.json())
      .then((data) => setServices(data.services ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-neutral-500">Chargement…</p>;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {services.map((s) => {
        const check = s.latest;
        const staleThresholdMs = 15 * 60 * 1000; // 3 missed 5-min ticks
        const isStale =
          check && Date.now() - new Date(check.checked_at).getTime() > staleThresholdMs;

        return (
          <Card key={s.service_name} className="p-4">
            <p className="text-sm font-medium text-neutral-900">
              {SERVICE_LABELS[s.service_name] ?? s.service_name}
            </p>
            <div className="mt-2">
              {!check ? (
                <StatusBadge variant="neutral">Jamais vérifié</StatusBadge>
              ) : isStale ? (
                <StatusBadge variant="warning">Données obsolètes</StatusBadge>
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
          </Card>
        );
      })}
      <Card className="border-dashed p-4">
        <p className="text-sm font-medium text-neutral-500">Konnect</p>
        <div className="mt-2">
          <StatusBadge variant="neutral">Non surveillé</StatusBadge>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Aucune intégration Konnect existante à sonder (Billing/paiements reste hors périmètre).
        </p>
      </Card>
    </div>
  );
}
