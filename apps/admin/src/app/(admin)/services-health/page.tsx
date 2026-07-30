import { InfraStatusGrid } from './InfraStatusGrid';
import { ScheduledJobsTable } from './ScheduledJobsTable';

/**
 * Doc 06 §6.3. Two real, independent sections:
 *   - Infra status grid (migration 0032, ping-service-health cron) —
 *     Supabase Auth/Storage, Resend, Expo Push. Konnect is deliberately
 *     unmonitored, shown as such rather than omitted — see 0032's header.
 *   - Scheduled-job table (`scheduled_job_runs`, migration 0010),
 *     corrected this session to actually monitor the three real
 *     cron-invoked jobs (0026, 0027, 0030) instead of a stale placeholder
 *     list that named jobs nothing in this repo ever runs.
 */
export default function ServicesHealthPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Santé des services</h1>

      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">
          Infrastructure
        </h2>
        <InfraStatusGrid />
      </div>

      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">
          Jobs planifiés
        </h2>
        <ScheduledJobsTable />
      </div>
    </div>
  );
}
