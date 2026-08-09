'use client';

import Link from 'next/link';
import { useState } from 'react';

import { quickActions } from '@/components/contractor/mock-data';
import {
  CalendarGrid,
  MetricCard,
  PageHeader,
  ProgressBar,
  SectionCard,
  TimelineList,
} from '@/components/contractor/Screen';
import { Button } from '@/components/ui/Button';
import { LinkButton } from '@/components/ui/LinkButton';

type DashboardStats = {
  activeProjectsCount: number;
  workersPresentToday: number;
  availableVehiclesCount: number;
  todayExpensesTotal: number;
  monthlyRevenue: number;
  budgetConsumedPercent: number;
};

type RecentLog = { caption: string | null; created_at: string; projects: { name: string } | null };
type RecentInvoice = { invoice_number: string; client_name: string; paid_at: string | null };
type RecentDispatch = {
  assignment_date: string;
  created_at: string;
  projects: { name: string } | null;
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

export function DashboardView({
  stats,
  recentLogs,
  recentPaidInvoices,
  recentDispatch,
  calendarDays,
}: {
  stats: DashboardStats;
  recentLogs: RecentLog[];
  recentPaidInvoices: RecentInvoice[];
  recentDispatch: RecentDispatch[];
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
      label: 'Revenu du mois',
      value: formatTND(stats.monthlyRevenue),
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

  const activities = [
    ...recentLogs.map((log) => ({
      title: 'Journal - ' + (log.projects?.name ?? 'Chantier'),
      description: log.caption ?? 'Photo ajoutee sans description.',
      time: formatTime(log.created_at),
      tone: 'accent' as const,
      sortDate: log.created_at,
    })),
    ...recentPaidInvoices.map((inv) => ({
      title: 'Facture payee',
      description: inv.client_name + ' - facture ' + inv.invoice_number,
      time: inv.paid_at ? formatTime(inv.paid_at) : '',
      tone: 'success' as const,
      sortDate: inv.paid_at ?? '',
    })),
    ...recentDispatch.map((d) => ({
      title: 'Dispatch - ' + (d.projects?.name ?? 'Chantier'),
      description: 'Affectation pour le ' + new Date(d.assignment_date).toLocaleDateString('fr-TN'),
      time: formatTime(d.created_at),
      tone: 'warning' as const,
      sortDate: d.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime())
    .slice(0, 6);

  const selectedCalendarDay = calendarDays.find((d) => d.day === selectedDay) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
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
                <div className="bg-neutral-0 absolute end-0 top-[calc(100%+8px)] z-40 w-56 rounded-[20px] border border-neutral-100 p-2 shadow-[0_24px_60px_rgba(17,19,24,0.16)]">
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
          description="Les derniers evenements operationnels de votre organisation."
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
