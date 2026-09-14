'use client';

import type { Project, ProjectExpense, ProjectStatus } from '@dala/shared-types';
import { Button, Card, DetailHeader, EmptyState, StatusBadge } from '@dala/ui-web';
import type { CreateProjectInput } from '@dala/validation';
import { BuildingsIcon, PencilSimpleIcon, PlusIcon } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { UpdateProjectInput } from '../actions';
import type { ProjectDashboardData } from '../getProjectDashboard';
import { ProjectExpenseFormModal } from '../ProjectExpenseFormModal';
import { ProjectFormModal } from '../ProjectFormModal';
import { ProjectRoster } from '../ProjectRoster';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { calculateConsumedPercent, calculateConsumedTotal } from '@/lib/budget';

/**
 * apps/web/src/app/(contractor)/projects/[projectId]/ProjectDetail.tsx
 *
 * Web consistency plan §2.8 — the real, addressable project detail page
 * that replaces ProjectsView's inline detail panel (which rendered below
 * the table, had no URL, and threw away the getProjectDashboard data it
 * fetched). Content moves from that inline card as-is: status, budget
 * usage, roster (ProjectRoster) and the expense ledger, now served on a
 * DetailHeader page. Numbers are sourced from REAL data — budgetConsumed
 * from project_expenses (the exact calculation the list already uses) and
 * the dashboard summary from getProjectDashboard — since a brand-new page
 * must not ship the fabricated stats (progress/teamSize/owner) that the
 * plan's Tier-1/2 fixes exist to remove from the list.
 */

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Actif',
  completed: 'Terminé',
  archived: 'Archivé',
};

const STATUS_VARIANT: Record<ProjectStatus, 'success' | 'neutral' | 'info'> = {
  active: 'success',
  completed: 'info',
  archived: 'neutral',
};

const BUDGET_ALERT_LABEL: Record<ProjectDashboardData['budgetAlertLevel'], string> = {
  none: 'Aucune alerte',
  warning70: '70% du budget consommé',
  warning90: '90% du budget consommé',
  over100: 'Budget dépassé',
};

function formatBudget(value: number | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('fr-TN')} TND`;
}

type ProjectMutationResult =
  { success: true; project: Project } | { success: false; error: string };
type CreateProjectAction = (input: CreateProjectInput) => Promise<ProjectMutationResult>;
type UpdateProjectAction = (input: UpdateProjectInput) => Promise<ProjectMutationResult>;

export function ProjectDetail({
  project,
  expenses,
  dashboard,
  orgId,
  canWrite,
  createProject,
  updateProject,
}: {
  project: Project;
  expenses: ProjectExpense[];
  dashboard: ProjectDashboardData;
  orgId: string;
  canWrite: boolean;
  createProject: CreateProjectAction;
  updateProject: UpdateProjectAction;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);

  const expensesTotal = calculateConsumedTotal(expenses);
  const budgetConsumed = calculateConsumedPercent(expensesTotal, project.budget_total);
  const progressTone: 'success' | 'warning' | 'danger' =
    budgetConsumed != null && budgetConsumed > 100
      ? 'danger'
      : budgetConsumed != null && budgetConsumed >= 80
        ? 'warning'
        : 'success';
  const statusTone: 'success' | 'warning' | 'danger' | 'neutral' =
    budgetConsumed === null ? 'neutral' : progressTone;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      <DetailHeader
        backHref="/projects"
        backLabel="Chantiers"
        icon={BuildingsIcon}
        title={project.name}
        status={
          <StatusBadge variant={STATUS_VARIANT[project.status]}>
            {STATUS_LABEL[project.status]}
          </StatusBadge>
        }
        meta={[
          { label: 'Client', value: project.client_name ?? 'Non renseigné' },
          { label: 'Adresse', value: project.address ?? 'Non renseignée' },
          { label: 'Budget total', value: formatBudget(project.budget_total) },
        ]}
        actions={
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilSimpleIcon size={16} className="me-1.5 inline" />
            Modifier le chantier
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Progression</p>
          <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
            {budgetConsumed != null ? `${budgetConsumed.toFixed(0)}%` : '—'}
          </p>
          <div className="mt-3">
            <ProgressBar value={budgetConsumed ?? 0} tone={progressTone} />
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Budget total</p>
          <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
            {formatBudget(project.budget_total)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Total facturé</p>
          <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
            {formatBudget(dashboard.invoicedAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-neutral-500">Ouvriers actifs (7 jours)</p>
          <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
            {dashboard.activeWorkersCount}
          </p>
        </Card>
      </div>

      <SectionCard
        title="Budget du chantier"
        description="Consommation réelle calculée sur les dépenses enregistrées."
      >
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-900">Budget consommé</span>
            <span className="text-neutral-500">
              {budgetConsumed != null ? `${budgetConsumed.toFixed(0)}%` : '—'}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar value={budgetConsumed ?? 0} tone={progressTone} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge variant={statusTone}>
              {budgetConsumed != null
                ? budgetConsumed < 80
                  ? 'Sous contrôle'
                  : budgetConsumed <= 100
                    ? 'À surveiller'
                    : 'Dépassement'
                : '—'}
            </StatusBadge>
            <span className="text-sm text-neutral-500">{formatBudget(expensesTotal)} dépensés</span>
            <span className="text-xs text-neutral-400">
              · Alerte budget : {BUDGET_ALERT_LABEL[dashboard.budgetAlertLevel]}
            </span>
          </div>
          {dashboard.lastJournalDate && (
            <p className="mt-3 text-xs text-neutral-500">
              Dernière entrée de journal :{' '}
              {new Date(dashboard.lastJournalDate).toLocaleDateString('fr-TN')}
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Équipe du chantier" description="Ouvriers affectés à ce chantier.">
        <ProjectRoster
          projectId={project.id}
          orgId={orgId}
          canWrite={canWrite && project.status === 'active'}
        />
      </SectionCard>

      <SectionCard
        title="Dépenses du chantier"
        description="Matériaux, carburant, sous-traitance et autres frais liés au projet."
        actions={
          <Button variant="secondary" onClick={() => setExpenseModalOpen(true)}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Ajouter une dépense
          </Button>
        }
      >
        {expenses.length === 0 ? (
          <EmptyState
            icon={BuildingsIcon}
            title="Aucune dépense enregistrée"
            description="Ajoutez un premier frais pour faire apparaître le budget consommé réel."
            actionLabel="Ajouter une dépense"
            onAction={() => setExpenseModalOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <Card key={expense.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900">
                      {expense.category === 'materiaux'
                        ? 'Matériaux'
                        : expense.category === 'carburant'
                          ? 'Carburant'
                          : expense.category === 'sous_traitance'
                            ? 'Sous-traitance'
                            : 'Autre'}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                      {expense.description ?? 'Aucune description'}
                    </p>
                    <p className="mt-1 text-xs text-neutral-400">{expense.expense_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-semibold text-neutral-900">
                      {formatBudget(Number(expense.amount))}
                    </p>
                    {expense.receipt_photo_url && (
                      <p className="text-success mt-1 text-xs">Justificatif joint</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </SectionCard>

      {editOpen && (
        <ProjectFormModal
          project={project}
          createProject={createProject}
          updateProject={updateProject}
          onSaved={() => router.refresh()}
          onClose={() => setEditOpen(false)}
        />
      )}
      {expenseModalOpen && (
        <ProjectExpenseFormModal
          orgId={orgId}
          projects={[{ id: project.id, name: project.name, status: project.status }]}
          defaultProjectId={project.id}
          onClose={() => setExpenseModalOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
