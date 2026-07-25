import { StatCard } from '@/components/ui/StatCard';
import { getAdminSupabaseClient } from '@/lib/supabase/admin-client';

/**
 * Doc 04 §4.3.2 — platform metrics. Doc 05 §3.6 — StatCard is fine here
 * (it's a plain metric number, not a marketing-adjacent hero card); the
 * "no hero cards" rule targets decorative/promotional cards, not this.
 */
export default async function DashboardPage() {
  const supabase = getAdminSupabaseClient();

  const [{ count: orgCount }, { count: userCount }, { count: activeOrgCount }] = await Promise.all([
    supabase.from('organizations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .is('suspended_at', null)
      .is('deleted_at', null),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-neutral-900">Métriques</h1>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Organisations totales" value={orgCount ?? 0} />
        <StatCard label="Organisations actives" value={activeOrgCount ?? 0} />
        <StatCard label="Utilisateurs totaux" value={userCount ?? 0} />
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        Signup/churn trends, MRR, and support-ticket volume (Doc 04 §4.3.2) need a time-series
        source that doesn't exist yet — the cards above are the real, currently-queryable subset.
      </p>
    </div>
  );
}
