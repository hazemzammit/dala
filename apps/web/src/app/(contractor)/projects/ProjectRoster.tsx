'use client';

import type { ProjectWorker, Worker } from '@dala/shared-types';
import { AvatarStack, Avatar, Button, Card, EmptyState, FormField } from '@dala/ui-web';
import { PlusIcon, TrashIcon, UsersIcon } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';

import { addWorkerToRoster, removeWorkerFromRoster } from './roster-actions';

interface RosterRow extends ProjectWorker {
  worker: Worker | null;
}

/**
 * apps/web/src/app/(contractor)/projects/ProjectRoster.tsx
 *
 * Gap-closure guide §1.7 — "which workers are staffed on THIS project,"
 * backed by `project_workers`. Distinct from Dispatch (day-by-day
 * scheduling) — don't conflate them, same warning migration 0034's header
 * and mobile's project-roster.tsx both give.
 *
 * Placed inside the project detail panel (ProjectsView.tsx) rather than
 * a separate top-level route, mirroring how project detail already works
 * on web (no `projects/[id]` route exists — detail is an inline panel).
 * This also replaces that panel's previous hardcoded three-name
 * AvatarStack ("Sami Haddad, Amina Ben Ali, Rami Cherif") with the real
 * roster — that fake data was specifically what §1.7 exists to fix, not
 * a separate decision the way `progress %`/`owner`'s fabricated stats
 * are (flagged separately, left untouched).
 *
 * Read-only once the project isn't active (`canWrite`), same
 * `checkProjectIsWritable` guard server-side in roster-actions.ts, and
 * the same client-side mirroring mobile does (hide the affordances
 * rather than let them fail on click).
 */
export function ProjectRoster({
  projectId,
  orgId,
  canWrite,
}: {
  projectId: string;
  orgId: string;
  canWrite: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [orgWorkers, setOrgWorkers] = useState<Worker[]>([]);
  const [orgWorkersLoading, setOrgWorkersLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingWorkerId, setAddingWorkerId] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<RosterRow | null>(null);
  const [removing, setRemoving] = useState(false);

  async function load() {
    setLoading(true);
    const supabase = createClient();

    // RLS (project_workers_select_member) already scopes this to the
    // caller's own org's rows on the project — no org_id filter needed.
    const { data: rosterRows } = await supabase
      .from('project_workers')
      .select('*')
      .eq('project_id', projectId)
      .is('removed_at', null)
      .order('added_at', { ascending: true });

    const workerIds = (rosterRows ?? []).map((r) => r.worker_id);
    const { data: workerRows } = workerIds.length
      ? await supabase.from('worker_directory').select('*').in('id', workerIds)
      : { data: [] as Worker[] };

    const merged: RosterRow[] = (rosterRows ?? []).map((r) => ({
      ...r,
      worker: (workerRows ?? []).find((w) => w.id === r.worker_id) ?? null,
    }));

    setRoster(merged);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const rosterWorkerIds = useMemo(() => new Set(roster.map((r) => r.worker_id)), [roster]);

  const filteredOrgWorkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return orgWorkers.filter((w) => {
      if (rosterWorkerIds.has(w.id)) return false;
      if (!query) return true;
      return w.full_name.toLowerCase().includes(query);
    });
  }, [orgWorkers, rosterWorkerIds, searchQuery]);

  async function openAddModal() {
    setSearchQuery('');
    setAddModalOpen(true);
    setOrgWorkersLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('active_worker_directory')
      .select('*')
      .eq('org_id', orgId)
      .order('full_name');
    setOrgWorkers(data ?? []);
    setOrgWorkersLoading(false);
  }

  async function handleAddWorker(worker: Worker) {
    if (addingWorkerId) return;
    setAddingWorkerId(worker.id);
    setError(null);
    const result = await addWorkerToRoster({ projectId, workerId: worker.id });
    setAddingWorkerId(null);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setAddModalOpen(false);
    await load();
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoving(true);
    setError(null);
    const result = await removeWorkerFromRoster({ id: removeTarget.id, projectId });
    setRemoving(false);
    if (!result.success) {
      setError(result.error);
      setRemoveTarget(null);
      return;
    }
    setRemoveTarget(null);
    await load();
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-neutral-500">
            Équipe du chantier
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            Travailleurs actuellement staffés sur ce chantier.
          </p>
        </div>
        {canWrite && (
          <Button variant="secondary" onClick={() => void openAddModal()}>
            <PlusIcon size={16} className="me-1.5 inline" />
            Ajouter un ouvrier
          </Button>
        )}
      </div>

      {!loading && roster.length > 0 && (
        <div className="mb-3">
          <AvatarStack people={roster.map((r) => ({ name: r.worker?.full_name ?? '?' }))} />
        </div>
      )}

      {error && <p className="text-danger mb-2 text-sm">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Chargement…</p>
      ) : roster.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Aucun travailleur sur ce chantier"
          description={
            canWrite
              ? 'Ajoutez un travailleur, ou planifiez un dispatch — les travailleurs dispatchés sont ajoutés automatiquement.'
              : "Aucun travailleur n'est actuellement staffé sur ce chantier."
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {roster.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-100 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar name={row.worker?.full_name ?? '?'} size={32} />
                <div>
                  <p className="text-sm font-semibold text-neutral-900">
                    {row.worker?.full_name ?? 'Travailleur supprimé'}
                  </p>
                  <p className="text-xs text-neutral-500">{row.worker?.trade ?? '—'}</p>
                </div>
              </div>
              {canWrite && (
                <button
                  onClick={() => setRemoveTarget(row)}
                  aria-label={`Retirer ${row.worker?.full_name ?? 'ce travailleur'} du chantier`}
                  className="rounded-control p-2 text-neutral-500 hover:bg-neutral-100"
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="max-h-[80vh] w-full max-w-md overflow-y-auto p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-neutral-900">
                Ajouter un ouvrier
              </h2>
              <button
                onClick={() => setAddModalOpen(false)}
                className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <FormField
              label="Rechercher"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nom du travailleur"
            />

            <div className="mt-4 flex flex-col gap-2">
              {orgWorkersLoading ? (
                <p className="text-center text-sm text-neutral-500">Chargement…</p>
              ) : filteredOrgWorkers.length === 0 ? (
                <p className="py-4 text-center text-sm text-neutral-500">
                  {orgWorkers.length === 0
                    ? 'Aucun travailleur actif dans votre organisation.'
                    : 'Aucun résultat, ou tous vos travailleurs sont déjà sur ce chantier.'}
                </p>
              ) : (
                filteredOrgWorkers.map((worker) => (
                  <button
                    key={worker.id}
                    onClick={() => void handleAddWorker(worker)}
                    disabled={addingWorkerId === worker.id}
                    className="bg-neutral-25 flex items-center gap-3 rounded-2xl p-3 text-start hover:bg-neutral-100 disabled:opacity-50"
                  >
                    <Avatar name={worker.full_name} size={28} />
                    <div>
                      <p className="text-sm font-medium text-neutral-900">{worker.full_name}</p>
                      <p className="text-xs text-neutral-500">{worker.trade ?? '—'}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title="Retirer du chantier ?"
        description={
          removeTarget
            ? `${removeTarget.worker?.full_name ?? 'Ce travailleur'} ne sera plus listé comme actif sur ce chantier. Son historique est conservé.`
            : ''
        }
        confirmLabel="Retirer"
        loading={removing}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
