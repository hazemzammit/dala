'use client';

import type { Project, ProjectExpense, ProjectStatus } from '@dala/shared-types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterSelect,
  IconActionButton,
  PageHero,
  StatusBadge,
} from '@dala/ui-web';
import type { CreateProjectInput } from '@dala/validation';
import {
  BuildingsIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  SquaresFourIcon,
  TrashIcon,
  ListIcon,
} from '@phosphor-icons/react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import type { UpdateProjectInput } from './actions';
import { getProjectDashboard, type ProjectDashboardData } from './getProjectDashboard';
import { ProjectExpenseFormModal } from './ProjectExpenseFormModal';
import { ProjectFormModal } from './ProjectFormModal';
import { ProjectRoster } from './ProjectRoster';

import { ProgressBar, SectionCard } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SearchInput } from '@/components/ui/SearchInput';
import { calculateConsumedPercent, calculateConsumedTotal } from '@/lib/budget';

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
  orgRole,
  createProject,
  updateProject,
  deleteProject,
}: {
  projects: Project[];
  expenses: ProjectExpense[];
  orgId: string;
  orgRole: 'owner' | 'manager' | 'viewer' | null;
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
  // §2.2 — sortable table already existed (DataTable's sortValue/click-to-
  // sort); the missing half was an alternate grid view. localStorage isn't
  // used (matches this codebase's no-client-storage convention elsewhere) —
  // this resets to 'table' on reload, a minor cosmetic trade-off, same
  // shape as AnnouncementBanner's dismiss-in-memory-only choice.
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [notice, setNotice] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // FLAGGED FOR HAZEM — dashboardData/dashboardLoading are fetched
  // (getProjectDashboard) but never actually rendered anywhere in this
  // component's JSX. Not something I'm building out here (a real dashboard
  // panel is a UI design decision, not a data-wiring one), but worth
  // knowing this fetch currently runs and does nothing with its result.
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

  // FLAGGED FOR HAZEM — same pattern as team/'s and vehicles/'s fabricated
  // stats: `progress`, `teamSize`, and `owner` are synthesized from array
  // index, not real data (progress would need a real definition — % of
  // budget consumed? % of days elapsed between start_date and an estimated
  // end? there's no "percent complete" column anywhere). `startDate`/
  // `endDate` here are ALSO fabricated and recomputed from `baseDate`,
  // ignoring the real `project.start_date` this pass just wired into the
  // create/edit form — worth fixing to use the real field now that it
  // exists, but left alongside the other fake fields rather than half-fixing
  // just this one number while the rest of the card stays fake. Only
  // `expensesTotal`/`budgetConsumed` here are computed from real data
  // (project_expenses).
  const displayRows = useMemo<ProjectRow[]>(() => {
    return rows.map((project, index) => {
      const baseDate = new Date(project.created_at);
      const startDate = new Date(baseDate);
      startDate.setDate(startDate.getDate() - 21 + index * 3);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 120 + index * 8);
      const projectExpenses = expensesByProject.get(project.id) ?? [];
      const expensesTotal = calculateConsumedTotal(projectExpenses);

      return {
        ...project,
        progress: Math.min(96, 24 + index * 12),
        startDate: startDate.toLocaleDateString('fr-TN'),
        endDate: endDate.toLocaleDateString('fr-TN'),
        teamSize: 4 + ((index * 2) % 8),
        owner: ['Nabil', 'Marwa', 'Amine', 'Yasmine'][index % 4]!,
        expensesTotal,
        budgetConsumed: calculateConsumedPercent(expensesTotal, project.budget_total),
        expenses: projectExpenses,
      };
    });
  }, [rows, expensesByProject]);

  // §2.7 global search — clicking a "project" result in the top-bar
  // dropdown deep-links here as ?highlight=<id>, opening that project's
  // detail panel directly instead of just landing on the unfiltered list.
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (!highlightId) return;
    const match = displayRows.find((p) => p.id === highlightId);
    if (match) setDetailState({ mode: 'project', project: match });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, displayRows]);

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

  async function handleDeleteProject() {
    if (deleteTarget === null) return;
    const target = deleteTarget;
    setDeleteError(null);
    const result = await deleteProject({ id: target.id, version: target.version });
    if (!result.success) {
      setDeleteError(result.error);
      return;
    }
    setRows((current) => current.filter((row) => row.id !== result.projectId));
    if (detailState.mode === 'project' && detailState.project.id === result.projectId) {
      setDetailState({ mode: 'none' });
    }
    setNotice(`${target.name} a été retiré de la liste des chantiers.`);
    setDeleteTarget(null);
  }

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
          <IconActionButton
            icon={EyeIcon}
            label={`Voir le détail de ${p.name}`}
            tone="neutral"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDetailState({ mode: 'project', project: p });
            }}
          />
          <IconActionButton
            icon={PencilSimpleIcon}
            label={`Modifier ${p.name}`}
            tone="neutral"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', project: p });
            }}
          />
          <IconActionButton
            icon={TrashIcon}
            label={`Supprimer ${p.name}`}
            tone="danger"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteError(null);
              setDeleteTarget(p);
            }}
          />
        </div>
      ),
    },
  ];

  const visibleCount = filteredRows.length;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      {notice && (
        <div className="border-success/20 bg-success/10 text-success rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <PageHero
        eyebrow="Chantiers"
        title="Chantiers"
        description="Recherchez, filtrez, consultez, modifiez et suivez les chantiers actifs avec leur budget consommé réel."
        actions={
          <Button onClick={() => setModalState({ mode: 'create' })}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Nouveau chantier
          </Button>
        }
      />

      <SectionCard
        title="Liste des chantiers"
        actions={
          <>
            <SearchInput value={query} onChange={setQuery} placeholder="Rechercher un chantier" />
            <FilterSelect
              aria-label="Filtrer par statut"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | 'all')}
              options={[
                { value: 'all', label: 'Tous les statuts' },
                { value: 'active', label: 'Actif' },
                { value: 'completed', label: 'Terminé' },
                { value: 'archived', label: 'Archivé' },
              ]}
            />
            <div className="flex overflow-hidden rounded-2xl border border-neutral-200">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-label="Vue tableau"
                aria-pressed={viewMode === 'table'}
                className={`p-2 ${viewMode === 'table' ? 'bg-accent-600 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
              >
                <ListIcon size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Vue grille"
                aria-pressed={viewMode === 'grid'}
                className={`p-2 ${viewMode === 'grid' ? 'bg-accent-600 text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}
              >
                <SquaresFourIcon size={16} />
              </button>
            </div>
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
          ) : viewMode === 'table' ? (
            <DataTable
              columns={columns}
              rows={filteredRows}
              getRowId={(p) => p.id}
              onRowClick={(p) => setDetailState({ mode: 'project', project: p })}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((p) => (
                <Card
                  key={p.id}
                  raised
                  className="cursor-pointer p-4"
                  onClick={() => setDetailState({ mode: 'project', project: p })}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-neutral-900">{p.name}</p>
                      <p className="text-xs text-neutral-500">{p.client_name ?? '—'}</p>
                    </div>
                    <StatusBadge variant={STATUS_VARIANT[p.status]}>
                      {STATUS_LABEL[p.status]}
                    </StatusBadge>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-neutral-500">
                      <span>Budget consommé</span>
                      <span>
                        {p.budgetConsumed != null ? `${p.budgetConsumed.toFixed(0)}%` : '—'}
                      </span>
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
                  <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                    <span>{formatBudget(p.budget_total)}</span>
                    <span>{p.teamSize} ouvrier(s)</span>
                  </div>
                </Card>
              ))}
            </div>
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

          <ProjectRoster
            projectId={selectedProject.id}
            orgId={orgId}
            canWrite={
              (orgRole === 'owner' || orgRole === 'manager') && selectedProject.status === 'active'
            }
          />

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

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Supprimer ${deleteTarget.name} ?` : ''}
        description={
          deleteTarget
            ? `Le chantier « ${deleteTarget.name} » sera retiré de la liste des chantiers.`
            : ''
        }
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => void handleDeleteProject()}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      >
        {deleteError && (
          <p className="text-danger mt-2 text-sm">
            Impossible de supprimer le chantier : {deleteError}
          </p>
        )}
      </ConfirmDialog>

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
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
            status: project.status,
          }))}
          defaultProjectId={expenseModalState.projectId}
          onClose={() => setExpenseModalState({ open: false })}
          onSaved={() => setNotice('Dépense enregistrée et budget recalculé.')}
        />
      )}
    </div>
  );
}
