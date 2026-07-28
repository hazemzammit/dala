'use client';

import type { Project, ProjectStatus } from '@dala/shared-types';
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
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
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
};

function formatBudget(value: number | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('fr-TN')} TND`;
}

export function ProjectsView({
  projects,
  createProject,
  updateProject,
  deleteProject,
}: {
  projects: Project[];
  createProject: CreateProjectAction;
  updateProject: UpdateProjectAction;
  deleteProject: DeleteProjectAction;
}) {
  const [rows, setRows] = useState(projects);
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [detailState, setDetailState] = useState<DetailState>({ mode: 'none' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const searchParams = useSearchParams();

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

  const displayRows = useMemo<ProjectRow[]>(() => {
    return rows.map((project, index) => {
      const baseDate = new Date(project.created_at);
      const startDate = new Date(baseDate);
      startDate.setDate(startDate.getDate() - 21 + index * 3);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 120 + index * 8);

      return {
        ...project,
        progress: Math.min(96, 24 + index * 12),
        startDate: startDate.toLocaleDateString('en-GB'),
        endDate: endDate.toLocaleDateString('en-GB'),
        teamSize: 4 + ((index * 2) % 8),
        owner: ['Nabil', 'Marwa', 'Amine', 'Yasmine'][index % 4]!,
      };
    });
  }, [rows]);

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
      header: 'Project',
      render: (p) => (
        <div>
          <div className="font-medium text-neutral-900">{p.name}</div>
          <div className="text-xs text-neutral-500">Owner: {p.owner}</div>
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
      header: 'Address',
      render: (p) => p.address ?? '—',
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (p) => (
        <div className="min-w-[160px]">
          <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
            <span>{p.progress}%</span>
            <span>{p.teamSize} people</span>
          </div>
          <ProgressBar value={p.progress} tone={p.progress > 75 ? 'success' : 'accent'} />
        </div>
      ),
      sortValue: (p) => p.progress,
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
      header: 'Status',
      render: (p) => (
        <StatusBadge variant={STATUS_VARIANT[p.status]}>{STATUS_LABEL[p.status]}</StatusBadge>
      ),
      sortValue: (p) => p.status,
    },
    {
      key: 'start_date',
      header: 'Start Date',
      render: (p) => p.startDate,
      sortValue: (p) => p.startDate,
    },
    {
      key: 'end_date',
      header: 'End Date',
      render: (p) => p.endDate,
      sortValue: (p) => p.endDate,
    },
    {
      key: 'team_size',
      header: 'Team Size',
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
            aria-label={`View details for ${p.name}`}
          >
            <EyeIcon size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModalState({ mode: 'edit', project: p });
            }}
            className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={`Modify ${p.name}`}
          >
            <PencilSimpleIcon size={16} />
          </button>
          <button
            onClick={async (e: MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              const confirmed = window.confirm(`Delete ${p.name}?`);
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
              setNotice(`${p.name} removed from the project list.`);
            }}
            className="rounded-control hover:bg-danger/5 hover:text-danger p-1.5 text-neutral-500"
            aria-label={`Delete ${p.name}`}
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
        title="Project pipeline"
        description="Search, filter, inspect, edit, and track progress across active projects."
        actions={
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | 'all')}
              className="bg-neutral-0 focus:border-accent-500 rounded-2xl border border-neutral-200 px-3 py-2 text-sm outline-none"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
            <Button onClick={() => setModalState({ mode: 'create' })}>
              <PlusIcon size={16} className="me-1.5 inline" />
              Create Project
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Projects
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {visibleCount}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Active
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {filteredRows.filter((row) => row.status === 'active').length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Average progress
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
              Budget pipeline
            </p>
            <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
              {formatBudget(filteredRows.reduce((sum, row) => sum + (row.budget_total ?? 0), 0))}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Team members
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
              title="No projects match your filters"
              description="Adjust the search or status filter to reveal projects."
              actionLabel="Clear filters"
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
                Project details
              </p>
              <h3 className="font-display mt-2 text-2xl font-semibold text-neutral-900">
                {selectedProject.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-500">
                {selectedProject.client_name ?? 'No client yet'} ·{' '}
                {selectedProject.address ?? 'No address'}
              </p>
            </div>
            <StatusBadge variant={STATUS_VARIANT[selectedProject.status]}>
              {STATUS_LABEL[selectedProject.status]}
            </StatusBadge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Progress</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {selectedProject.progress}%
              </p>
              <div className="mt-3">
                <ProgressBar value={selectedProject.progress} tone="accent" />
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Budget</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {formatBudget(selectedProject.budget_total)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Team size</p>
              <p className="font-display mt-1 text-2xl font-semibold text-neutral-900">
                {selectedProject.teamSize}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-neutral-500">Assigned crew</p>
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
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => setModalState({ mode: 'edit', project: selectedProject })}
            >
              <PencilSimpleIcon size={16} className="me-1.5 inline" />
              Edit project
            </Button>
            <Button variant="secondary" onClick={() => setDetailState({ mode: 'none' })}>
              Close details
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
    </>
  );
}
