'use client';

import type { Project } from '@dala/shared-types';
import { Card, EmptyState, ErrorState, StatusBadge } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { BuildingsIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { calculateConsumedTotal } from '@/lib/budget';
import { createClient } from '@/lib/supabase/client';

type ProjectRollup = Project & {
  totalExpenses: number;
  workerDaysThisMonth: number;
  workersToday: number;
  pendingMaterials: number;
};

const STATUS_LABELS: Record<
  Project['status'],
  { label: string; variant: 'success' | 'neutral' | 'info' }
> = {
  active: { label: 'Actif', variant: 'success' },
  completed: { label: 'Terminé', variant: 'info' },
  archived: { label: 'Archivé', variant: 'neutral' },
};

function firstOfMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * apps/web/src/app/(contractor)/portfolio/PortfolioView.tsx
 *
 * Ported from mobile's portfolio.tsx. One stated simplification, same
 * reasoning as analytics' headcount chips: mobile decorates each card with
 * a project-type icon/color chip via `getProjectTypeMeta` — no web
 * equivalent helper exists, and building one solely for this one card
 * wasn't worth the scope, so every card uses a plain BuildingsIcon
 * instead.
 *
 * The >=90% red / else teal progress-bar threshold below is this screen's
 * own two-tone rule, deliberately NOT `lib/budget.ts`'s `thresholdColor`
 * (which is a three-tier >100/>=80/else rule) — mobile's portfolio.tsx
 * hardcodes this simpler threshold itself, so this keeps that distinction
 * rather than silently unifying two different design decisions.
 */
export function PortfolioView({ orgId }: { orgId: string }) {
  const [rollups, setRollups] = useState<ProjectRollup[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — the root `projects` query had no error capture;
  // a failed fetch previously rendered as "Aucun chantier actif,"
  // indistinguishable from a genuinely-empty portfolio.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const supabase = createClient();

      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .eq('lead_org_id', orgId)
        .is('deleted_at', null)
        .in('status', ['active', 'completed'])
        .order('name');
      if (projectsError) {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
        return;
      }

      const monthStart = firstOfMonthISO();
      const today = todayISO();

      const withRollups: ProjectRollup[] = await Promise.all(
        (projects ?? []).map(async (project) => {
          const [
            { data: expenses },
            { count: workerDays },
            { count: workersToday },
            { count: pendingMaterials },
          ] = await Promise.all([
            supabase.from('project_expenses').select('amount').eq('project_id', project.id),
            supabase
              .from('attendance_effective')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', project.id)
              .eq('status', 'present')
              .gte('record_date', monthStart),
            supabase
              .from('dispatch_assignments')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', project.id)
              .eq('assignment_date', today),
            supabase
              .from('materials')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', project.id)
              .eq('status', 'pending'),
          ]);
          return {
            ...project,
            totalExpenses: calculateConsumedTotal(expenses ?? []),
            workerDaysThisMonth: workerDays ?? 0,
            workersToday: workersToday ?? 0,
            pendingMaterials: pendingMaterials ?? 0,
          };
        }),
      );

      if (!cancelled) {
        setRollups(withRollups);
        setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, reloadKey]);

  return (
    <>
      <PageHero
        eyebrow="Analyses"
        title="Portefeuille"
        description="Budget et activité de tous vos chantiers actifs et terminés."
      />

      <SectionCard title={loading ? 'Chargement…' : `${rollups.length} chantier(s)`}>
        {loading ? (
          <p className="text-sm text-neutral-500">Chargement…</p>
        ) : loadError ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : rollups.length === 0 ? (
          <EmptyState
            icon={BuildingsIcon}
            title="Aucun chantier actif"
            description="Le portefeuille regroupe le budget et l'activité de tous vos chantiers actifs et terminés."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rollups.map((p) => (
              <PortfolioCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}

function PortfolioCard({ project: p }: { project: ProjectRollup }) {
  const budgetTotal = p.budget_total ?? 0;
  const pctConsumed = useMemo(
    () => (budgetTotal > 0 ? Math.min(100, (p.totalExpenses / budgetTotal) * 100) : null),
    [budgetTotal, p.totalExpenses],
  );

  return (
    <Card raised className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-3">
          <div className="bg-accent-50 rounded-control flex h-9 w-9 items-center justify-center">
            <BuildingsIcon size={18} weight="fill" className="text-accent-600" />
          </div>
          <p className="truncate text-[15.5px] font-semibold text-neutral-900">{p.name}</p>
        </div>
        <StatusBadge variant={STATUS_LABELS[p.status].variant}>
          {STATUS_LABELS[p.status].label}
        </StatusBadge>
      </div>

      {pctConsumed !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-[12.5px] text-neutral-500">Budget consommé</span>
            <span className="text-[12.5px] text-neutral-500">
              {p.totalExpenses.toFixed(0)} / {budgetTotal.toFixed(0)} TND ({pctConsumed.toFixed(0)}
              %)
            </span>
          </div>
          <ProgressBar value={pctConsumed} tone={pctConsumed >= 90 ? 'danger' : 'accent'} />
        </div>
      ) : (
        <p className="text-[12.5px] text-neutral-500">Aucun budget renseigné pour ce chantier.</p>
      )}

      <div className="flex gap-4">
        <div>
          <p className="text-[16px] font-semibold text-neutral-900">{p.workersToday}</p>
          <p className="text-xs text-neutral-500">Travailleurs aujourd&apos;hui</p>
        </div>
        <div>
          <p
            className={`text-[16px] font-semibold ${p.pendingMaterials > 0 ? 'text-warning' : 'text-neutral-900'}`}
          >
            {p.pendingMaterials}
          </p>
          <p className="text-xs text-neutral-500">Demandes en attente</p>
        </div>
      </div>

      <p className="text-[12.5px] text-neutral-500">
        {p.workerDaysThisMonth} jour(s)-travailleur ce mois-ci
      </p>
    </Card>
  );
}
