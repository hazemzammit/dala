'use client';

import type { Project, ProjectExpense, ProjectStatus } from '@dala/shared-types';
import type { CreateProjectInput, UpdateProjectInput } from '@dala/validation';
import {
  BuildingsIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import { getProjectDashboard, type ProjectDashboardData } from './getProjectDashboard';
import { ProjectExpenseFormModal } from './ProjectExpenseFormModal';
import { ProjectFormModal } from './ProjectFormModal';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';

type ProjectMutationResult =
  { success: true; project: Project } | { success: false; error: string };
type CreateProjectAction = (input: CreateProjectInput) => Promise<ProjectMutationResult>;
type UpdateProjectAction = (input: UpdateProjectInput) => Promise<ProjectMutationResult>;
type DeleteProjectAction = (input: { id: string; version: number }) => Promise<
  | {
      success: true;
      projectId: string;
    }
  | { success: false; error: string }
>;

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

type ModalState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; project: Project };
type DetailState = { mode: 'none' } | { mode: 'project'; project: ProjectRow };

type ProjectRow = Project & {
  progress: number;
  startDate: string;
  endDate: string;
  teamSize: number;
  owner: string;
  expensesTotal: number;
  budgetConsumed: number | null;
  expenses: ProjectExpense[];
};

function formatBudget(value: number | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('fr-TN')} TND`;
}

function getBudgetTone(value: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (value == null) return 'neutral';
  if (value < 80) return 'success';
  if (value <= 100) return 'warning';
  return 'danger';
}

export function ProjectsView({
  projects,
  expenses,
  orgId,
  createProject,
  updateProject,
  deleteProject,
}: {
  projects: Project[];
  expenses: ProjectExpense[];
  orgId: string;
  createProject: CreateProjectAction;
  updateProject: UpdateProjectAction;
  deleteProject: DeleteProjectAction;
}) {
  const [rows, setRows] = useState(projects);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [detailState, setDetailState] = useState<DetailState>({ mode: 'none' });
  const [expenseModalState, setExpenseModalState] = useState<{ open: boolean; projectId?: string }>(
    {
      open: false,
    },
  );
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [dashboardData, setDashboardData] = useState<ProjectDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  useEffect(() => {
    setRows(projects);
  }, [projects]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModalState({ mode: 'create' });
    }
  }, [searchParams]);
  useEffect(() => {
    if (detailState.mode !== 'project') {
      setDashboardData(null);
      return;
    }
    setDashboardLoading(true);
    getProjectDashboard(detailState.project.id, detailState.project.budget_total)
      .then(setDashboardData)
      .finally(() => setDashboardLoading(false));
  }, [detailState]);

  function upsertProject(project: Project) {
    setRows((current) => [project, ...current.filter((row) => row.id !== project.id)]);
  }

  const expensesByProject = useMemo(() => {
    const map = new Map<string, ProjectExpense[]>();
    for (const expense of expenses) {
      const list = map.get(expense.project_id) ?? [];
      list.push(expense);
      map.set(expense.project_id, list);
    }
    return map;
  }, [expenses]);

  const displayRows = useMemo<ProjectRow[]>(() => {
    return rows.map((project, index) => {
      const baseDate = new Date(project.created_at);
      const startDate = new Date(baseDate);
      startDate.setDate(startDate.getDate() - 21 + index * 3);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 120 + index * 8);
      const projectExpenses = expensesByProject.get(project.id) ?? [];
      const expensesTotal = projectExpenses.reduce(
        (sum, expense) => sum + Number(expense.amount),
        0,
      );

      return {
        ...project,
        progress: Math.min(96, 24 + index * 12),
        startDate: startDate.toLocaleDateString('fr-TN'),
        endDate: endDate.toLocaleDateString('fr-TN'),
        teamSize: 4 + ((index * 2) % 8),
        owner: ['Nabil', 'Marwa', 'Amine', 'Yasmine'][index % 4]!,
        expensesTotal,
        budgetConsumed:
          project.budget_total && project.budget_total > 0
            ? (expensesTotal / project.budget_total) * 100
            : null,
        expenses: projectExpenses,
      };
    });
  }, [rows, expensesByProject]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        lower.length === 0 ||
        [row.name, row.client_name ?? '', row.address ?? '', row.owner].some((value) =>
          value.toLowerCase().includes(lower),
        );
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [displayRows, query, statusFilter]);

  const selectedProject = detailState.mode === 'project' ? detailState.project : null;

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      key: 'name',
      header: 'Chantier',
      render: (p) => (
        <div>
          <div className="font-medium text-neutral-900">{p.name}</div>
          <div className="text-xs text-neutral-500">Responsable : {p.owner}</div>
        </div>
      ),
      sortValue: (p) => p.name,
    },
    {
      key: 'client_name',
      header: 'Client',
      render: (p) => p.client_name ?? '—',
      sortValue: (p) => p.client_name ?? '',
    },
    {
      key: 'address',
      header: 'Adresse',
      render: (p) => p.address ?? '—',
    },
    {
      key: 'budget_consumed',
      header: 'Budget consommé',
      render: (p) => (
        <div className="min-w-[180px]">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
            <StatusBadge variant={getBudgetTone(p.budgetConsumed)}>
              {p.budgetConsumed != null ? `${p.budgetConsumed.toFixed(0)}%` : '—'}
            </StatusBadge>
            <span>{formatBudget(p.expensesTotal)}</span>
          </div>
          <ProgressBar
            value={p.budgetConsumed ?? 0}
            tone={
              p.budgetConsumed != null && p.budgetConsumed > 100
                ? 'danger'
                : p.budgetConsumed != null && p.budgetConsumed >= 80
                  ? 'warning'
                  : 'success'
            }
          />
        </div>
      ),
      sortValue: (p) => p.budgetConsumed ?? 0,
    },
    {
      key: 'budget_total',
      header: 'Budget',
      render: (p) => formatBudget(p.budget_total),
      sortValue: (p) => p.budget_total ?? 0,
      align: 'right',
    },
    {
      key: 'status',
      header: 'Statut',
      render: (p) => (
        <StatusBadge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</StatusBadge>
      ),
      sortValue: (p) => p.status,
    },
    {
      key: 'start_date',
      header: 'Date de début',
      render: (p) => p.startDate,
      sortValue: (p) => p.startDate,
    },
    {
      key: 'end_date',
      header: 'Date de fin',
      render: (p) => p.endDate,
      sortValue: (p) => p.endDate,
    },
    {
      key: 'team_size',
      header: 'Taille de l’équipe',
      render: (p) => p.teamSize,
      align: 'right',
      sortValue: (p) => p.teamSize,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetailState({ mode: 'project', project: p });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Voir le détail de ${p.name}`}
          >
            <EyeIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', project: p });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Modifier ${p.name}`}
          >
            <PencilSimpleIcon size={16} />
          </button>
          <button
            onClick={async (e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              const confirmed = window.confirm(`Supprimer ${p.name} ?`);
              if (!confirmed) return;

              const result = await deleteProject({ id: p.id, version: p.version });
              if (!result.success) {
                window.alert(result.error);
                return;
              }

              setRows((current) => current.filter((row) => row.id !== result.projectId));
              if (detailState.mode === 'project' && detailState.project.id === result.projectId) {
                setDetailState({ mode: 'none' });
              }
              setNotice(`${p.name} a été retiré de la liste des chantiers.`);
            }}
            className="rounded-control hover:bg-danger/5 hover:text-danger p-1.5 text-neutral-500"
            aria-label={`Supprimer ${p.name}`}
          >
            <TrashIcon size={16} />
          </button>
        </div>
      ),
    },
  ];

  const visibleCount = filteredRows.length;

  return (
    <>
      {notice && (
        <div className="border-success/20 bg-success/10 text-success mb-4 rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <SectionCard
        title="Chantiers"
        description="Recherchez, filtrez, consultez, modifiez et suivez les chantiers actifs avec leur budget consommé réel."
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un chantier"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | 'all')}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="completed">Terminé</option>
              <option value="archived">Archivé</option>
            </select>
            <Button onClick={() => setModalState({ mode: 'create' })}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Nouveau chantier
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Chantiers
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {visibleCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Actifs
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((row) => row.status === 'active').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Progression moyenne
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {Math.round(
                filteredRows.reduce((sum, row) => sum + row.progress, 0) /
                  Math.max(1, visibleCount),
              )}
              %
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Dépenses totales
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {formatBudget(filteredRows.reduce((sum, row) => sum + row.expensesTotal, 0))}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Ouvriers planifiés
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.reduce((sum, row) => sum + row.teamSize, 0)}
            </p>
          </Card>
        </div>

        <div className="mt-5">
          {filteredRows.length === 0 ? (
            <EmptyState
              icon={BuildingsIcon}
              title="Aucun chantier ne correspond à vos filtres"
              description="Ajustez la recherche ou le filtre de statut pour afficher les chantiers."
              actionLabel="Effacer les filtres"
              onAction={() => {
                setQuery('');
                setStatusFilter('all');
              }}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={filteredRows}
              getRowId={(p) => p.id}
              onRowClick={(p) => setDetailState({ mode: 'project', project: p })}
            />
          )}
        </div>
      </SectionCard>

      {selectedProject && (
        <Card raised className="mt-6 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                Détail du chantier
              </p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-neutral-900">
                {selectedProject.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {selectedProject.client_name ?? 'Aucun client'} ·{' '}
                {selectedProject.address ?? 'Aucune adresse'}
              </p>
            </div>
            <StatusBadge variant={STATUS_VARIANT[selectedProject.status]}>
              {STATUS_LABEL[selectedProject.status]}
            </StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Progression</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {selectedProject.progress}%
              </p>
              <div className="mt-3">
                <ProgressBar value={selectedProject.progress} tone="accent" />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Budget total</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {formatBudget(selectedProject.budget_total)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Taille de l’équipe</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {selectedProject.teamSize}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Équipe affectée</p>
              <div className="mt-3">
                <AvatarStack
                  people={[
                    { name: 'Sami Haddad' },
                    { name: 'Amina Ben Ali' },
                    { name: 'Rami Cherif' },
                  ]}
                />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Budget consommé</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {selectedProject.budgetConsumed != null
                  ? `${selectedProject.budgetConsumed.toFixed(0)}%`
                  : '—'}
              </p>
              <div className="mt-2">
                <StatusBadge variant={getBudgetTone(selectedProject.budgetConsumed)}>
                  {selectedProject.budgetConsumed != null
                    ? selectedProject.budgetConsumed < 80
                      ? 'Sous contrôle'
                      : selectedProject.budgetConsumed <= 100
                        ? 'À surveiller'
                        : 'Dépassement'
                    : '—'}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {formatBudget(selectedProject.expensesTotal)} dépensés
              </p>
            </Card>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
                  Dépenses du chantier
                </p>
                <p className="mt-1 text-sm text-neutral-500">
                  Matériaux, carburant, sous-traitance et autres frais liés au projet.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setExpenseModalState({ open: true, projectId: selectedProject.id })}
              >
                <PlusIcon size={16} className="me-1.5 inline" />
                Ajouter une dépense
              </Button>
            </div>

            {selectedProject.expenses.length === 0 ? (
              <EmptyState
                icon={BuildingsIcon}
                title="Aucune dépense enregistrée"
                description="Ajoutez un premier frais pour faire apparaître le budget consommé réel."
                actionLabel="Ajouter une dépense"
                onAction={() => setExpenseModalState({ open: true, projectId: selectedProject.id })}
              />
            ) : (
              <div className="space-y-3">
                {selectedProject.expenses.map((expense) => (
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
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => setModalState({ mode: 'edit', project: selectedProject })}
            >
              <PencilSimpleIcon size={16} className="me-1.5 inline" />
              Modifier le chantier
            </Button>
            <Button variant="secondary" onClick={() => setDetailState({ mode: 'none' })}>
              Fermer le détail
            </Button>
          </div>
        </Card>
      )}

      {modalState.mode !== 'closed' && (
        <ProjectFormModal
          project={modalState.mode === 'edit' ? modalState.project : undefined}
          createProject={createProject}
          updateProject={updateProject}
          onSaved={upsertProject}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}

      {expenseModalState.open && (
        <ProjectExpenseFormModal
          orgId={orgId}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
          defaultProjectId={expenseModalState.projectId}
          onClose={() => setExpenseModalState({ open: false })}
          onSaved={() => setNotice('Dépense enregistrée et budget recalculé.')}
        />
      )}
    </>
  );
}
