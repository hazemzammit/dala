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
  Pagination,
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
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import type { UpdateProjectInput } from './actions';
import { ProjectFormModal } from './ProjectFormModal';

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

type ProjectRow = Project & {
  progress: number | null; // alias of budgetConsumed (plan §12a decision 2)
  startDate: string | null; // real project.start_date (ISO), null when unset
  teamSize: number;
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
  teamSizeByProject,
  createProject,
  updateProject,
  deleteProject,
}: {
  projects: Project[];
  expenses: ProjectExpense[];
  teamSizeByProject: Record<string, number>;
  createProject: CreateProjectAction;
  updateProject: UpdateProjectAction;
  deleteProject: DeleteProjectAction;
}) {
  const [rows, setRows] = useState(projects);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  // §2.2 — sortable table already existed (DataTable's sortValue/click-to-
  // sort); the missing half was an alternate grid view. localStorage isn't
  // used (matches this codebase's no-client-storage convention elsewhere) —
  // this resets to 'table' on reload, a minor cosmetic trade-off, same
  // shape as AnnouncementBanner's dismiss-in-memory-only choice.
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [notice, setNotice] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useEffect(() => {
    setRows(projects);
  }, [projects]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setModalState({ mode: 'create' });
    }
  }, [searchParams]);

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

  // FLAGGED FOR HAZEM — resolved in the Tier-2 data pass (plan Step 12a):
  // `progress` is now a defined product concept — an alias of
  // budgetConsumed (% of budget spent, the only measurable completion
  // signal projects have) per decision 2 — and the fabricated `owner`/
  // `endDate` fields are gone (no responsable/end_date source exists;
  // decisions 1 & 4). Everything here is real data: teamSize (Step 11),
  // startDate (Step 11), expensesTotal/budgetConsumed (project_expenses).
  const displayRows = useMemo<ProjectRow[]>(() => {
    return rows.map((project) => {
      const projectExpenses = expensesByProject.get(project.id) ?? [];
      const expensesTotal = calculateConsumedTotal(projectExpenses);
      const budgetConsumed = calculateConsumedPercent(expensesTotal, project.budget_total);

      return {
        ...project,
        progress: budgetConsumed,
        // Real data (plan Step 11): raw ISO start_date keeps the column's
        // sortValue lexicographically correct; the render does the fr-TN
        // formatting.
        startDate: project.start_date ?? null,
        teamSize: teamSizeByProject[project.id] ?? 0,
        expensesTotal,
        budgetConsumed,
        expenses: projectExpenses,
      };
    });
  }, [rows, expensesByProject, teamSizeByProject]);

  const filteredRows = useMemo(() => {
    const lower = query.trim().toLowerCase();
    return displayRows.filter((row) => {
      const matchesSearch =
        lower.length === 0 ||
        [row.name, row.client_name ?? '', row.address ?? ''].some((value) =>
          value.toLowerCase().includes(lower),
        );
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [displayRows, query, statusFilter]);

  // Plan Step 13 — pagination, admin's shape (OrganizationsTable et al.,
  // PAGE_SIZE = 50 there too): DataTable only renders the controls; the
  // caller slices rows to the current page. Back to page 1 whenever a filter
  // input changes, and clamp the rendered page so deleting the last row of
  // the last page can't strand an empty view.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredRows, currentPage],
  );

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
    setNotice(`${target.name} a été retiré de la liste des chantiers.`);
    setDeleteTarget(null);
  }

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      key: 'name',
      header: 'Chantier',
      render: (p) => <div className="font-medium text-neutral-900">{p.name}</div>,
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
      render: (p) => (p.startDate ? new Date(p.startDate).toLocaleDateString('fr-TN') : '—'),
      sortValue: (p) => p.startDate ?? '',
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
              router.push(`/projects/${p.id}`);
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
                filteredRows.reduce((sum, row) => sum + (row.progress ?? 0), 0) /
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
              rows={pagedRows}
              getRowId={(p) => p.id}
              onRowClick={(p) => router.push(`/projects/${p.id}`)}
              pagination={{
                page: currentPage,
                pageSize: PAGE_SIZE,
                total: filteredRows.length,
                onPageChange: setPage,
              }}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pagedRows.map((p) => (
                  <Card
                    key={p.id}
                    raised
                    className="cursor-pointer p-4"
                    onClick={() => router.push(`/projects/${p.id}`)}
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
              {pageCount > 1 && (
                <Pagination
                  page={currentPage}
                  pageSize={PAGE_SIZE}
                  total={filteredRows.length}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>
      </SectionCard>

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
    </div>
  );
}
