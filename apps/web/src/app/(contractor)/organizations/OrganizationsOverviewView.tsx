'use client';

import { Card, EmptyState, ErrorState } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { GlobeHemisphereWestIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';

interface OrgSummary {
  org_id: string;
  name: string;
}

interface OrgRollup {
  org: OrgSummary;
  activeProjects: number;
  weekAdvancesTotal: number;
  dispatchPlannedTomorrow: boolean;
  pendingRequests: number;
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function weekAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * apps/web/src/app/(contractor)/organizations/OrganizationsOverviewView.tsx
 *
 * Gap-closure guide §1.8 — same "never blended" discipline mobile's
 * vue-ensemble.tsx documents: one independent set of queries per owned
 * org, composed into N cards client-side, never a single `in (org_ids)`
 * query summed together. RLS (`is_org_member`) would allow the summed
 * version too, but the spec's "never blended" is about the OUTPUT shape,
 * not just about what RLS permits — same reasoning mobile's own comment
 * gives for why this fetches N times.
 */
export function OrganizationsOverviewView({ userId }: { userId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rollups, setRollups] = useState<OrgRollup[]>([]);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  // Phase 20 (§1.7a) — the root `organization_members` query had no
  // error capture; a failed fetch previously rendered as "Aucune vue
  // d'ensemble à afficher," indistinguishable from genuinely owning
  // only one org. The per-org rollup queries inside fetchOrgRollup
  // already degrade gracefully (a failed sub-query just contributes 0),
  // left as-is, same reasoning as mobile's vue-ensemble.tsx.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const supabase = createClient();

      const { data: memberships, error: membershipsError } = await supabase
        .from('organization_members')
        .select('org_id, role, organizations(name)')
        .eq('user_id', userId)
        .eq('role', 'owner');
      if (membershipsError) {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
        return;
      }

      const owned: OrgSummary[] = (memberships ?? [])
        .map((m) => {
          const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
          return {
            org_id: m.org_id as string,
            name: (org as { name: string } | undefined)?.name ?? '—',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const results = await Promise.all(owned.map((org) => fetchOrgRollup(org)));
      if (!cancelled) {
        setRollups(results);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  async function fetchOrgRollup(org: OrgSummary): Promise<OrgRollup> {
    const supabase = createClient();
    const tomorrow = tomorrowISO();
    const weekAgo = weekAgoISO();

    const [projectsRes, advancesRes, dispatchRes, materialsRes, workerAdvancesRes] =
      await Promise.all([
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('lead_org_id', org.org_id)
          .is('deleted_at', null)
          .eq('status', 'active'),
        supabase
          .from('advances')
          .select('amount')
          .eq('org_id', org.org_id)
          .gte('created_at', weekAgo),
        supabase
          .from('dispatch_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', org.org_id)
          .eq('assignment_date', tomorrow),
        supabase
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', org.org_id)
          .eq('status', 'pending'),
        supabase
          .from('advances')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', org.org_id)
          .eq('status', 'pending'),
      ]);

    const weekAdvancesTotal = (advancesRes.data ?? []).reduce(
      (sum, row: { amount: number }) => sum + (row.amount ?? 0),
      0,
    );

    return {
      org,
      activeProjects: projectsRes.count ?? 0,
      weekAdvancesTotal,
      dispatchPlannedTomorrow: (dispatchRes.count ?? 0) > 0,
      pendingRequests: (materialsRes.count ?? 0) + (workerAdvancesRes.count ?? 0),
    };
  }

  async function handleSwitch(orgId: string) {
    setSwitchingOrgId(orgId);
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ active_org_id: orgId })
      .eq('id', userId);
    if (!error) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setSwitchingOrgId(null);
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Multi-organisation"
        title="Vue d'ensemble"
        description="Entreprises que vous possédez — chiffres calculés indépendamment pour chacune, jamais combinés entre organisations."
      />

      <SectionCard title={loading ? 'Chargement…' : `${rollups.length} entreprise(s) possédée(s)`}>
        {loading ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : loadError ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : rollups.length === 0 ? (
          <EmptyState
            icon={GlobeHemisphereWestIcon}
            title="Aucune vue d'ensemble à afficher"
            description="Vue d'ensemble compare les entreprises que vous possédez — vous n'en possédez qu'une pour le moment."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rollups.map((r) => (
              <Card key={r.org.org_id} raised className="flex flex-col gap-3 p-4">
                <p className="font-medium text-neutral-900">{r.org.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Chantiers actifs" value={String(r.activeProjects)} />
                  <Stat label="Avances (7 j)" value={`${r.weekAdvancesTotal.toFixed(0)} TND`} />
                  <Stat
                    label="Demain"
                    value={r.dispatchPlannedTomorrow ? 'Planifié' : 'Non planifié'}
                  />
                  <Stat label="Demandes en attente" value={String(r.pendingRequests)} />
                </div>
                <button
                  onClick={() => void handleSwitch(r.org.org_id)}
                  disabled={switchingOrgId === r.org.org_id}
                  className="text-accent-700 mt-1 text-sm font-semibold hover:underline disabled:opacity-50"
                >
                  {switchingOrgId === r.org.org_id
                    ? 'Basculement…'
                    : 'Basculer vers cette entreprise →'}
                </button>
              </Card>
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-neutral-900">{value}</p>
    </div>
  );
}
