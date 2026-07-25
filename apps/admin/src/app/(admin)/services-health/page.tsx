import { ScheduledJobsTable } from './ScheduledJobsTable';

import { Card } from '@/components/ui/Card';

/**
 * Doc 04 §4.3.9. The scheduled-job table below is real (reads
 * `scheduled_job_runs`, migration 0010). The infrastructure status grid
 * and edge-function invocation log aren't built — no uptime-check
 * mechanism or invocation-log table exists yet, and faking green/red dots
 * with no real check behind them would be worse than not showing them.
 */
export default function ServicesHealthPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Santé des services</h1>

      <Card className="border-dashed p-4">
        <p className="text-sm text-neutral-500">
          Grille de statut infrastructure (Supabase API/Auth/Storage/Realtime, Edge Functions,
          Konnect, Resend, Expo Push) — pas encore construite, aucun mécanisme de vérification en
          temps réel n'existe encore.
        </p>
      </Card>

      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">
          Jobs planifiés
        </h2>
        <ScheduledJobsTable />
      </div>
    </div>
  );
}
