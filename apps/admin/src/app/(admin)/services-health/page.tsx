import { PageHero, SectionCard } from '@dala/ui-web';
import { PulseIcon } from '@phosphor-icons/react/ssr';
import { Suspense } from 'react';

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
 *
 * Phase 5 (plan §5.10) — bare <h1> becomes a PageHero (icon PulseIcon,
 * same title "Santé des services", no description — none exists today
 * and none is invented); each bare <h2> wrapper becomes a tone-less
 * SectionCard with the same title verbatim (Level-1 surface per Phase 4.6).
 * No icon prop on the SectionCards — the plan names titles only.
 */
export default function ServicesHealthPage() {
  return (
    <div className="space-y-6">
      <PageHero icon={PulseIcon} title="Santé des services" />

      <SectionCard title="Infrastructure">
        <InfraStatusGrid />
      </SectionCard>

      <SectionCard title="Jobs planifiés">
        <ScheduledJobsTable />
      </SectionCard>

      {/* Tier 4.4 / Phase 5.3 — same useSearchParams()-requires-Suspense
          reasoning as apps/(admin)/users/page.tsx. Only this widget reads
          the URL; the other three render without waiting on it. */}
      <Suspense fallback={<p className="text-sm text-neutral-500">Chargement…</p>}>
        <SectionCard title="Journal des invocations (Edge Functions)">
          <InvocationLogTable />
        </SectionCard>
      </Suspense>

      <SectionCard title="Délivrabilité des emails (rebonds & plaintes)">
        <EmailDeliverabilityTable />
      </SectionCard>
    </div>
  );
}
