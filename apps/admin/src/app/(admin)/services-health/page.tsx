import { EmailDeliverabilityTable } from './EmailDeliverabilityTable';
import { InfraStatusGrid } from './InfraStatusGrid';
import { InvocationLogTable } from './InvocationLogTable';
import { ScheduledJobsTable } from './ScheduledJobsTable';

/**
 * Doc 06 §6.3. Four real, independent sections:
 *   - Infra status grid (migration 0032, ping-service-health cron) —
 *     Supabase Auth/Storage/Realtime, Resend, Expo Push. Konnect is
 *     deliberately unmonitored, shown as such rather than omitted — see
 *     0032's header.
 *   - Scheduled-job table (`scheduled_job_runs`, migration 0010),
 *     corrected this session to actually monitor the three real
 *     cron-invoked jobs (0026, 0027, 0030) instead of a stale placeholder
 *     list that named jobs nothing in this repo ever runs.
 *   - Edge Function invocation log (`edge_function_invocations`, migration
 *     0057, admin remediation Tier 2.1) — the missing "user-triggered, not
 *     cron" half scheduled_job_runs never covered. See 0057's header.
 *   - Email deliverability (`email_delivery_events`, migration 0064,
 *     admin remediation Tier 4.7) — recent bounces/complaints from
 *     Resend's webhook (resend-webhook Edge Function). Delivered/opened/
 *     clicked events are logged but not shown here — see
 *     EmailDeliverabilityTable's own header for why.
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

      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">
          Journal des invocations (Edge Functions)
        </h2>
        <InvocationLogTable />
      </div>

      <div>
        <h2 className="font-display mb-3 text-base font-semibold text-neutral-900">
          Délivrabilité des emails (rebonds &amp; plaintes)
        </h2>
        <EmailDeliverabilityTable />
      </div>
    </div>
  );
}
