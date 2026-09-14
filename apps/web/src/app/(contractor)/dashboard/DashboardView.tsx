'use client';

import { Button } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import Link from 'next/link';
import { useState } from 'react';

import { quickActions } from '@/components/contractor/mock-data';
import {
  CalendarGrid,
  MetricCard,
  ProgressBar,
  SectionCard,
  TimelineList,
} from '@/components/contractor/Screen';
import { LinkButton } from '@/components/ui/LinkButton';

type DashboardStats = {
  activeProjectsCount: number;
  workersPresentToday: number;
  availableVehiclesCount: number;
  todayExpensesTotal: number;
  monthlyInvoicedTotal: number;
  budgetConsumedPercent: number;
};

// Audit fix 6a — mirrors packages/shared-types' OrgActivityEvent (the same
// type mobile's dashboard.tsx uses for this exact table), kept local here
// rather than importing it since this file otherwise has no dependency on
// @dala/shared-types.
type ActivityEvent = {
  id: string;
  event_type:
    'site_log_added' | 'expense_recorded' | 'safety_incident_reported' | 'dispatch_assigned';
  actor_id: string | null;
  project_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
type CalendarDay = {
  day: string;
  date: string;
  count: number;
  label: string;
  tone: 'accent' | 'success' | 'warning';
};

function formatTND(value: number): string {
  return value.toLocaleString('fr-TN') + ' TND';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' });
}

/** Phase 8 §1.7 — one human-readable line per feed event, same event-type
 *  copy as apps/mobile's dashboard.tsx activityEventLabel(), split into
 *  title/description to fit TimelineList's existing shape rather than
 *  introducing a second timeline component just for this card. */
function activityEventText(
  event: ActivityEvent,
  actorNameById: Record<string, string>,
  feedProjectNameById: Record<string, string>,
  feedWorkerNameById: Record<string, string>,
): { title: string; description: string; tone: 'accent' | 'success' | 'warning' | 'danger' } {
  const actor = event.actor_id
    ? (actorNameById[event.actor_id] ?? 'Quelqu\u2019un')
    : 'L\u2019équipe';
  const project = event.project_id ? feedProjectNameById[event.project_id] : null;
  switch (event.event_type) {
    case 'site_log_added':
      return {
        title: 'Journal de chantier',
        description: `${actor} a ajouté une entrée au journal${project ? ` · ${project}` : ''}`,
        tone: 'accent',
      };
    case 'expense_recorded': {
      const amount = event.metadata?.amount;
      return {
        title: 'Dépense enregistrée',
        description: `${actor} a enregistré une dépense${amount != null ? ` de ${amount} TND` : ''}${project ? ` · ${project}` : ''}`,
        tone: 'warning',
      };
    }
    case 'safety_incident_reported': {
      const severity = event.metadata?.severity as string | undefined;
      const severityLabel =
        severity === 'severe' ? 'grave' : severity === 'moderate' ? 'modéré' : 'mineur';
      return {
        title: 'Incident de sécurité',
        description: `${actor} a signalé un incident (${severityLabel})${project ? ` · ${project}` : ''}`,
        tone: 'danger',
      };
    }
    case 'dispatch_assigned': {
      const workerId = event.metadata?.worker_id as string | undefined;
      const workerName = workerId
        ? (feedWorkerNameById[workerId] ?? 'Un travailleur')
        : 'Un travailleur';
      return {
        title: 'Dispatch',
        description: `${workerName} dispatché${project ? ` · ${project}` : ''}`,
        tone: 'success',
      };
    }
    default:
      return { title: 'Activité', description: '', tone: 'accent' };
  }
}

export function DashboardView({
  stats,
  activityFeed,
  actorNameById,
  feedProjectNameById,
  feedWorkerNameById,
  calendarDays,
}: {
  stats: DashboardStats;
  activityFeed: ActivityEvent[];
  actorNameById: Record<string, string>;
  feedProjectNameById: Record<string, string>;
  feedWorkerNameById: Record<string, string>;
  calendarDays: CalendarDay[];
}) {
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dashboardStats = [
    {
      label: 'Chantiers actifs',
      value: stats.activeProjectsCount.toString(),
      tone: 'success' as const,
    },
    {
      label: 'Ouvriers presents aujourd hui',
      value: stats.workersPresentToday.toString(),
      tone: 'success' as const,
    },
    {
      label: 'Vehicules disponibles',
      value: stats.availableVehiclesCount.toString(),
      tone: 'success' as const,
    },
    {
      label: 'Depenses du jour',
      value: formatTND(stats.todayExpensesTotal),
      tone: 'warning' as const,
    },
    {
      label: 'Facturé ce mois',
      value: formatTND(stats.monthlyInvoicedTotal),
      tone: 'success' as const,
    },
    {
      label: 'Budget consomme',
      value: stats.budgetConsumedPercent + '%',
      tone:
        stats.budgetConsumedPercent >= 100
          ? ('danger' as const)
          : stats.budgetConsumedPercent >= 80
            ? ('warning' as const)
            : ('success' as const),
    },
  ];

  // Audit fix 6a — activityFeed is now the real org_activity_feed rows
  // (already ordered/limited server-side in page.tsx), mapped through
  // activityEventText for TimelineList's title/description/tone shape.
  const activities = activityFeed.map((event) => {
    const { title, description, tone } = activityEventText(
      event,
      actorNameById,
      feedProjectNameById,
      feedWorkerNameById,
    );
    return { title, description, time: formatTime(event.created_at), tone };
  });

  const selectedCalendarDay = calendarDays.find((d) => d.day === selectedDay) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHero
        eyebrow="Centre de commande"
        title="Tunisia Construction OS"
        description="Gerez les chantiers, le dispatch, l equipe, les vehicules, les materiaux, la facturation et le reporting client depuis un seul tableau de bord."
        actions={
          <>
            <LinkButton variant="secondary" href="/reports">
              Voir les rapports
            </LinkButton>
            <div className="relative">
              <Button onClick={() => setQuickMenuOpen((open) => !open)}>Action rapide</Button>
              {quickMenuOpen && (
                <div className="bg-neutral-0 rounded-card absolute end-0 top-[calc(100%+8px)] z-40 w-56 border border-neutral-100 p-2 shadow-[0_24px_60px_rgba(17,19,24,0.16)]">
                  {quickActions.map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      onClick={() => setQuickMenuOpen(false)}
                      className="hover:bg-neutral-25 block w-full rounded-2xl px-3 py-2.5 text-left text-sm font-medium text-neutral-900 transition-colors"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {dashboardStats.map((stat) => (
          <MetricCard key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard
          title="Budget des chantiers actifs"
          description="Pourcentage du budget total deja consomme sur les chantiers en cours."
        >
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-neutral-900">Budget consomme</span>
              <span className="text-neutral-500">{stats.budgetConsumedPercent}%</span>
            </div>
            <div className="mt-2">
              <ProgressBar
                value={stats.budgetConsumedPercent}
                tone={
                  stats.budgetConsumedPercent >= 100
                    ? 'danger'
                    : stats.budgetConsumedPercent >= 80
                      ? 'warning'
                      : 'success'
                }
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Actions rapides"
          description="Raccourcis operationnels les plus utilises."
        >
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="bg-neutral-25 hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 rounded-2xl border border-neutral-100 px-4 py-4 text-left text-sm font-medium text-neutral-900 transition-colors"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          title="Activites recentes"
          description="Les dernieres entrees de journal, depenses, incidents et affectations de votre organisation."
        >
          {activities.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune activite recente pour le moment.</p>
          ) : (
            <TimelineList items={activities} />
          )}
        </SectionCard>

        <SectionCard
          title="Calendrier de dispatch"
          description="Nombre d'affectations planifiees cette semaine, par jour."
        >
          <CalendarGrid
            days={calendarDays}
            selectedDay={selectedDay}
            onDayClick={(day) => setSelectedDay(day === selectedDay ? null : day)}
          />
          {selectedCalendarDay && (
            <p className="mt-3 text-sm text-neutral-500">
              <span className="font-medium text-neutral-900">
                {new Date(selectedCalendarDay.date).toLocaleDateString('fr-TN', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                })}
              </span>
              {' - '}
              {selectedCalendarDay.label}
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
