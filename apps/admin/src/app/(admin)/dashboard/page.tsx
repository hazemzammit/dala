import { IconStatCard, PageHero } from '@dala/ui-web';
import {
  BuildingsIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  CoinsIcon,
  GaugeIcon,
  HardDrivesIcon,
  HardHatIcon,
  ReceiptIcon,
  UsersThreeIcon,
} from '@phosphor-icons/react/ssr';

import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

/**
 * Doc 04 §4.3.2 — platform metrics. Doc 05 §3.6 — StatCard is fine here
 * (it's a plain metric number, not a marketing-adjacent hero card); the
 * "no hero cards" rule targets decorative/promotional cards, not this.
 *
 * Refreshed this remediation phase — the previous version's comment said
 * MRR "needs a time-series source that doesn't exist yet," which stopped
 * being true once migration 0043 added billing_cycles. Added: MRR (real,
 * from 0043), project/site-log/expense counts (real, plain counts against
 * tables that already existed), and total storage used (reused from
 * admin_storage_usage_by_org(), 0026 — not duplicated).
 *
 * Still NOT built, flagged rather than faked:
 *   - DAU/MAU, invite-acceptance rate — genuinely need event/time-series
 *     data (a login-events or invite-status-change log) that doesn't
 *     exist anywhere in this schema. No column to count against.
 *   - Churn rate — subscription_status (0043) only started accumulating
 *     real history this phase; there isn't yet a meaningful period of
 *     canceled/past_due transitions to compute a rate from. Shipping 0%
 *     here would look like a real number and wouldn't be one.
 *   - Time-range selector (7d/30d/90d/custom), trend charts, plan-
 *     distribution donut — no charting library in this app's
 *     package.json yet (checked before deciding not to add one this
 *     phase); this is the next layer, flagged as a follow-up rather than
 *     shipped half-built.
 */
export default async function DashboardPage() {
  const supabase = getAdminSupabaseClient();

  const [
    { count: orgCount },
    { count: userCount },
    { count: activeOrgCount },
    { count: projectCount },
    { count: siteLogCount },
    { count: expenseCount },
    { data: cycleRows },
    { data: storageRows },
  ] = await Promise.all([
    supabase.from('organizations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .is('suspended_at', null)
      .is('deleted_at', null),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('site_logs').select('*', { count: 'exact', head: true }),
    supabase.from('project_expenses').select('*', { count: 'exact', head: true }),
    // MRR — same "current cycle, active org, paid" definition as the
    // Billing screen (api/admin/billing/route.ts), so the two numbers
    // can never quietly disagree.
    supabase
      .from('billing_cycles')
      .select('org_id, cycle_start, cycle_end, amount_millimes, status'),
    // Doc 04 §4.3.2 "photos/storage used" — reuses admin_storage_usage_by_org()
    // (migration 0026), the same RPC Storage Monitor and the Organizations
    // list already call, rather than a fourth copy of the aggregation.
    supabase.rpc('admin_storage_usage_by_org'),
  ]);

  const { data: orgStatusRows } = await supabase
    .from('organizations')
    .select('id, subscription_status');

  const today = new Date().toISOString().slice(0, 10);
  const activeOrgIds = new Set(
    (orgStatusRows ?? [])
      .filter((o) => o.subscription_status === 'active')
      .map((o) => o.id as string),
  );
  const mrrMillimes = (cycleRows ?? [])
    .filter(
      (c) =>
        activeOrgIds.has(c.org_id as string) &&
        c.status === 'paid' &&
        (c.cycle_start as string) <= today &&
        (c.cycle_end as string) >= today,
    )
    .reduce((sum, c) => sum + (c.amount_millimes as number), 0);

  const totalStorageBytes = ((storageRows ?? []) as { total_bytes: number }[]).reduce(
    (sum, r) => sum + r.total_bytes,
    0,
  );
  const totalStorageGb = (totalStorageBytes / (1024 * 1024 * 1024)).toFixed(2);

  return (
    <div>
      <PageHero
        icon={GaugeIcon}
        title="Métriques"
        description="Vue d'ensemble de la plateforme : organisations, utilisateurs, activité et facturation."
      />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <IconStatCard
          icon={BuildingsIcon}
          tone="accent"
          label="Organisations totales"
          value={orgCount ?? 0}
        />
        <IconStatCard
          icon={CheckCircleIcon}
          tone="success"
          label="Organisations actives"
          value={activeOrgCount ?? 0}
        />
        <IconStatCard
          icon={UsersThreeIcon}
          tone="categoricalBlue"
          label="Utilisateurs totaux"
          value={userCount ?? 0}
        />
        <IconStatCard
          icon={CoinsIcon}
          tone="categoricalViolet"
          label="MRR"
          value={`${(mrrMillimes / 1000).toFixed(3)} TND`}
        />
        <IconStatCard
          icon={HardHatIcon}
          tone="categoricalAmber"
          label="Projets"
          value={projectCount ?? 0}
        />
        <IconStatCard
          icon={ClipboardTextIcon}
          tone="accent"
          label="Journaux de chantier"
          value={siteLogCount ?? 0}
        />
        <IconStatCard
          icon={ReceiptIcon}
          tone="warning"
          label="Dépenses enregistrées"
          value={expenseCount ?? 0}
        />
        <IconStatCard
          icon={HardDrivesIcon}
          tone="neutral"
          label="Stockage utilisé"
          value={`${totalStorageGb} Go`}
        />
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        DAU/MAU et taux d'acceptation des invitations nécessitent une source d'événements
        chronologiques qui n'existe pas encore dans ce schéma. Le taux de désabonnement (churn) n'a
        pas encore assez d'historique réel sur <code>subscription_status</code> pour être
        significatif — ni l'un ni l'autre n'est affiché plutôt que d'afficher un chiffre inventé. Le
        sélecteur de plage de dates, les graphiques de tendance et le donut de répartition des plans
        restent un prochain chantier (aucune bibliothèque de graphiques n'est encore installée dans
        cette app).
      </p>
    </div>
  );
}
