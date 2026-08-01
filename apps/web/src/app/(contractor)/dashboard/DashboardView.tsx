'use client';

import Link from 'next/link';
import { useState } from 'react';

import {
  dashboardStats,
  quickActions,
  recentActivities,
  weeklyCalendar,
  weeklyCashflow,
  weeklyCashflowLabels,
} from '@/components/contractor/mock-data';
import {
  CalendarGrid,
  MetricCard,
  MiniBarChart,
  PageHeader,
  ProgressBar,
  SectionCard,
  TimelineList,
} from '@/components/contractor/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/LinkButton';

export function DashboardView() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Centre de commande"
        title="Tunisia Construction OS"
        description="Gérez les chantiers, le dispatch, l’équipe, les véhicules, les matériaux, la facturation et le reporting client depuis un seul tableau de bord."
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
          <MetricCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            delta={stat.delta}
            tone={stat.tone}
            footnote={stat.footnote}
          />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <SectionCard
          title="Consommation du budget"
          description="Flux de trésorerie hebdomadaire et pression budgétaire sur les chantiers actifs."
          actions={
            <LinkButton variant="text" href="/reports">
              Ouvrir l’analytique
            </LinkButton>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="bg-neutral-25 rounded-[20px] border border-neutral-100 p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                    Tendance hebdomadaire du chiffre d’affaires
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    TND générés par les jalons terminés.
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-semibold text-neutral-900">246.8k</div>
                  <div className="text-success text-xs">+14% vs last month</div>
                </div>
              </div>
              <MiniBarChart values={weeklyCashflow} labels={weeklyCashflowLabels} />
            </div>

            <Card className="p-5">
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900">Budget consommé</span>
                    <span className="text-neutral-500">68%</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={68} tone="warning" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900">Paie allouée</span>
                    <span className="text-neutral-500">54%</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={54} tone="success" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900">Matériaux engagés</span>
                    <span className="text-neutral-500">81%</span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={81} tone="danger" />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </SectionCard>

        <SectionCard
          title="Actions rapides"
          description="Raccourcis opérationnels les plus utilisés."
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
          title="Activités récentes"
          description="Les derniers événements opérationnels de la plateforme."
        >
          <TimelineList items={recentActivities} />
        </SectionCard>

        <div className="grid gap-6">
          <SectionCard
            title="Calendrier"
            description="Fenêtre de planification pour la semaine en cours."
          >
            <CalendarGrid
              days={weeklyCalendar}
              selectedDay={selectedDay}
              onDayClick={(day) => setSelectedDay(day)}
            />
            {selectedDay && (
              <p className="mt-3 text-sm text-neutral-500">
                Sélectionné :{' '}
                <span className="font-medium text-neutral-900">
                  {weeklyCalendar.find((d) => d.day === selectedDay)?.label ?? selectedDay}
                </span>
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Priorités du jour"
            description="Rappels à fort signal pour l’équipe chantier."
          >
            <div className="space-y-3">
              {[
                'Confirmer l’affectation des véhicules avant 08:30',
                'Téléverser les photos d’avancement pour les chantiers 2 et 4',
                'Approuver les dépenses de carburant envoyées hier',
                'Envoyer des rappels de facture à deux clients en retard',
              ].map((item) => (
                <div
                  key={item}
                  className="bg-neutral-25 flex items-start gap-3 rounded-2xl px-4 py-3"
                >
                  <span className="bg-accent-600 mt-1 h-2.5 w-2.5 rounded-full" />
                  <p className="text-sm leading-6 text-neutral-900">{item}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
