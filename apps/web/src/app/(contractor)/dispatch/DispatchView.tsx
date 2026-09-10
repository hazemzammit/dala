'use client';

import type { DispatchAssignment, Project, Vehicle, Worker } from '@dala/shared-types';
import { Button, Card, EmptyState, FormField, StatusBadge } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import type { UpdateDispatchAssignmentInput } from '@dala/validation';
import {
  CaretLeftIcon,
  CaretRightIcon,
  PlusIcon,
  CopyIcon,
  CalendarIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  copyPreviousWeekDispatchAssignments,
  createDispatchAssignments,
  updateDispatchAssignment,
} from './actions';

import { SectionCard } from '@/components/contractor/Screen';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

type DispatchAssignmentRow = DispatchAssignment;

type DispatchRowWithLabels = DispatchAssignmentRow & {
  workerName: string;
  vehicleName: string;
  vehicleStatus: Vehicle['status'];
  projectName: string;
};

type ModalState =
  | { mode: 'closed' }
  | { mode: 'create'; date: string; vehicleId?: string }
  | { mode: 'edit'; assignment: DispatchRowWithLabels };

function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + delta);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat('fr-TN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
}

function formatLongDate(date: Date) {
  return new Intl.DateTimeFormat('fr-TN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);
}

function formatTime(value: string | null) {
  if (!value) return '—';
  return value.slice(0, 5);
}

export function DispatchView({
  weekStart,
  vehicles,
  workers,
  projects,
  assignments,
}: {
  weekStart: string;
  vehicles: Vehicle[];
  workers: Worker[];
  projects: Project[];
  assignments: DispatchRowWithLabels[];
}) {
  const router = useRouter();
  const [modalState, setModalState] = useState<ModalState>({ mode: 'closed' });
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const weekStartDate = useMemo(() => new Date(`${weekStart}T00:00:00`), [weekStart]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate],
  );

  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, DispatchRowWithLabels[]>();
    for (const assignment of assignments) {
      const key = `${assignment.vehicle_id ?? ''}:${assignment.assignment_date}`;
      map.set(key, [...(map.get(key) ?? []), assignment]);
    }
    return map;
  }, [assignments]);

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const workerById = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker])),
    [workers],
  );

  const displayAssignments = useMemo(() => {
    return assignments.map((assignment) => ({
      ...assignment,
      workerName: workerById.get(assignment.worker_id)?.full_name ?? 'Ouvrier inconnu',
      vehicleName:
        vehicles.find((vehicle) => vehicle.id === assignment.vehicle_id)?.name ??
        'Véhicule inconnu',
      vehicleStatus:
        vehicles.find((vehicle) => vehicle.id === assignment.vehicle_id)?.status ?? 'available',
      projectName: projectById.get(assignment.project_id ?? '')?.name ?? 'Chantier inconnu',
    }));
  }, [assignments, projectById, vehicles, workerById]);

  const totals = useMemo(
    () => ({
      vehicles: vehicles.length,
      assignments: assignments.length,
      workers: new Set(assignments.map((assignment) => assignment.worker_id)).size,
    }),
    [assignments, vehicles.length],
  );

  function navigateWeek(direction: -1 | 1) {
    const next = addDays(weekStartDate, direction * 7);
    router.push(`/dispatch?week=${formatDateInput(next)}`);
  }

  function navigateToday() {
    router.push(`/dispatch?week=${formatDateInput(startOfWeek(new Date()))}`);
  }

  function openCreate(date: string, vehicleId?: string) {
    setModalState({ mode: 'create', date, vehicleId });
    setNotice(null);
  }

  function openEdit(assignment: DispatchRowWithLabels) {
    setModalState({ mode: 'edit', assignment });
    setNotice(null);
  }

  function closeModal() {
    setModalState({ mode: 'closed' });
  }

  function refreshWithNotice(message: string) {
    setNotice(message);
    router.refresh();
  }

  function handleCopyPreviousWeek() {
    startTransition(async () => {
      const result = await copyPreviousWeekDispatchAssignments({ week_start: weekStart });
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      refreshWithNotice(
        `${result.copiedCount} affectation(s) ont été recopiées depuis la semaine précédente.`,
      );
    });
  }

  // §2.1 — drag-and-drop reassignment. A chip carries its own assignment id
  // via the native HTML5 drag payload; a drop targets a (vehicle, day)
  // cell. Same-day, cross-vehicle drops call the existing
  // `updateDispatchAssignment` action — the same one the click-based edit
  // modal already uses — so the exact same server-side conflict check
  // (`getDispatchConflictMessage`) runs before anything commits. A
  // rejected drop is never applied optimistically (nothing moves until
  // `router.refresh()` re-renders from the server), so there's nothing to
  // animate back — the chip simply stays put and the conflict reason
  // shows as the existing notice banner.
  //
  // Cross-day drags are intentionally not supported: `updateDispatchAssignment`
  // (and its validation schema) can only change `vehicle_id`/`departure_time`/
  // `actual_departure_time`/`confirmation_channel` — `assignment_date` isn't
  // a settable field. Adding that would be new backend work, which the
  // guide's own note for this feature explicitly scopes out ("no new
  // backend work"). Dropping into a different day's column is a no-op with
  // an explanatory notice rather than silently failing.
  function handleChipDragStart(e: React.DragEvent, assignment: DispatchRowWithLabels) {
    e.dataTransfer.setData('text/plain', assignment.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(assignment.id);
  }

  function handleChipDragEnd() {
    setDraggingId(null);
    setDragOverKey(null);
  }

  function handleCellDragOver(e: React.DragEvent, cellKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverKey(cellKey);
  }

  function handleCellDrop(e: React.DragEvent, vehicle: Vehicle, day: Date) {
    e.preventDefault();
    setDragOverKey(null);
    const assignmentId = e.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!assignmentId) return;

    const origin = assignments.find((a) => a.id === assignmentId);
    if (!origin) return;

    const targetDateStr = formatDateInput(day);
    if (origin.assignment_date !== targetDateStr) {
      setNotice(
        "Le déplacement d'un jour à l'autre n'est pas encore pris en charge — modifiez l'affectation directement pour changer sa date.",
      );
      return;
    }
    if (origin.vehicle_id === vehicle.id) return; // dropped back where it started

    setMovingId(assignmentId);
    startTransition(async () => {
      const result = await updateDispatchAssignment({
        id: origin.id,
        assignment_date: origin.assignment_date,
        worker_id: origin.worker_id,
        vehicle_id: vehicle.id,
        version: origin.version,
      });
      setMovingId(null);
      if (!result.success) {
        setNotice(result.error);
        return;
      }
      refreshWithNotice(`${origin.workerName} réaffecté à ${vehicle.name}.`);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
      {notice && (
        <div className="border-accent-200 bg-accent-50 text-accent-700 rounded-2xl border px-4 py-3 text-sm">
          {notice}
        </div>
      )}

      <PageHero
        eyebrow="Dispatch"
        title="Tableau de dispatch hebdomadaire"
        description="Planifiez les ouvriers, véhicules et chantiers sur 7 jours. Les conflits bloquent l’enregistrement avant toute écriture."
        actions={
          <>
            <Button variant="secondary" onClick={navigateToday}>
              <CalendarIcon size={16} className="me-1 inline" />
              Aujourd’hui
            </Button>
            <Button variant="secondary" onClick={() => navigateWeek(-1)}>
              <CaretLeftIcon size={16} className="me-1 inline" />
              Semaine précédente
            </Button>
            <Button variant="secondary" onClick={() => navigateWeek(1)}>
              Semaine suivante
              <CaretRightIcon size={16} className="ms-1 inline" />
            </Button>
            <Button onClick={() => openCreate(formatDateInput(weekStartDate), vehicles[0]?.id)}>
              <PlusIcon size={16} className="me-1 inline" />
              Nouvelle assignation
            </Button>
            <Link href="/dispatch/week">
              <Button variant="secondary" fullWidth={false}>
                <UsersThreeIcon size={16} className="me-1.5 inline" />
                Vue semaine
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5" raised>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Véhicules
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {totals.vehicles}
          </p>
        </Card>
        <Card className="p-5" raised>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Affectations
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {totals.assignments}
          </p>
        </Card>
        <Card className="p-5" raised>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
            Ouvriers planifiés
          </p>
          <p className="font-display mt-2 text-2xl font-semibold text-neutral-900">
            {totals.workers}
          </p>
        </Card>
      </div>

      <SectionCard
        title="Grille hebdomadaire"
        description={`Semaine du ${formatLongDate(weekDays[0] ?? weekStartDate)} au ${formatLongDate(weekDays[6] ?? weekStartDate)}`}
        actions={
          <button
            type="button"
            onClick={handleCopyPreviousWeek}
            className="text-xs font-medium text-neutral-500 hover:text-neutral-900"
          >
            <CopyIcon size={12} className="me-1 inline" />
            Copier la semaine précédente
          </button>
        }
      >
        {/* §2.1 — drag a chip onto a different vehicle's cell (same day) to
            reassign; the drop runs through the same conflict-checked
            updateDispatchAssignment action the click-based edit modal uses. */}
        {vehicles.length === 0 ? (
          <EmptyState
            icon={WarningCircleIcon}
            title="Aucun véhicule disponible"
            description="Ajoutez d’abord un véhicule pour pouvoir construire la grille de dispatch."
            actionLabel="Créer un véhicule"
            actionHref="/vehicles"
          />
        ) : (
          <div className="overflow-hidden rounded-[22px] border border-neutral-100">
            <div className="bg-neutral-25 grid grid-cols-[240px_repeat(7,minmax(170px,1fr))] border-b border-neutral-100 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              <div className="px-4 py-3">Véhicule</div>
              {weekDays.map((day) => (
                <div key={day.toISOString()} className="px-4 py-3">
                  {formatDayLabel(day)}
                </div>
              ))}
            </div>

            <div className="divide-y divide-neutral-100 bg-white">
              {vehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  className="grid grid-cols-[240px_repeat(7,minmax(170px,1fr))]"
                >
                  <div className="border-e border-neutral-100 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-neutral-900">{vehicle.name}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Capacité {vehicle.capacity} · {vehicle.plate ?? 'Sans immatriculation'}
                        </p>
                      </div>
                      <StatusBadge
                        variant={
                          vehicle.status === 'available'
                            ? 'success'
                            : vehicle.status === 'maintenance'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {vehicle.status === 'available'
                          ? 'Disponible'
                          : vehicle.status === 'maintenance'
                            ? 'Maintenance'
                            : 'En service'}
                      </StatusBadge>
                    </div>
                  </div>

                  {weekDays.map((day) => {
                    const key = `${vehicle.id}:${formatDateInput(day)}`;
                    const cellAssignments = assignmentsByCell.get(key) ?? [];
                    const isDragOver = dragOverKey === key;

                    return (
                      <div
                        key={key}
                        onDragOver={(e) => handleCellDragOver(e, key)}
                        onDragLeave={() =>
                          setDragOverKey((current) => (current === key ? null : current))
                        }
                        onDrop={(e) => handleCellDrop(e, vehicle, day)}
                        className={`group border-e border-neutral-100 px-3 py-3 last:border-e-0 ${
                          isDragOver ? 'bg-accent-50' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openCreate(formatDateInput(day), vehicle.id)}
                          className="text-accent-700 hover:bg-accent-50 mb-2 inline-flex rounded-full px-2 py-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <PlusIcon size={12} className="me-1" />
                          Ajouter
                        </button>

                        <div className="space-y-2">
                          {cellAssignments.length === 0 ? (
                            <button
                              type="button"
                              onClick={() => openCreate(formatDateInput(day), vehicle.id)}
                              className="bg-neutral-25 hover:border-accent-200 hover:bg-accent-50 min-h-[84px] w-full rounded-2xl border border-dashed border-neutral-200 px-3 py-3 text-left text-sm text-neutral-400 transition-colors"
                            >
                              Aucune affectation
                            </button>
                          ) : (
                            cellAssignments.map((assignment) => (
                              <button
                                key={assignment.id}
                                type="button"
                                draggable
                                onDragStart={(e) => handleChipDragStart(e, assignment)}
                                onDragEnd={handleChipDragEnd}
                                onClick={() => openEdit(assignment)}
                                className={`bg-neutral-25 hover:border-accent-200 hover:bg-accent-50 w-full cursor-grab rounded-2xl border border-neutral-100 px-3 py-3 text-left shadow-[0_4px_10px_rgba(17,19,24,0.04)] transition-colors active:cursor-grabbing ${
                                  draggingId === assignment.id || movingId === assignment.id
                                    ? 'opacity-40'
                                    : ''
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-medium text-neutral-900">
                                      {assignment.workerName}
                                    </p>
                                    <p className="mt-1 text-xs text-neutral-500">
                                      {assignment.projectName}
                                    </p>
                                  </div>
                                  <span className="text-xs font-medium text-neutral-500">
                                    {formatTime(assignment.departure_time)}
                                  </span>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Affectations de la semaine"
        description="Vue compacte des affectations confirmées pour la semaine affichée."
      >
        {displayAssignments.length === 0 ? (
          <EmptyState
            icon={WarningCircleIcon}
            title="Aucune affectation cette semaine"
            description="Utilisez la grille ci-dessus ou copiez la semaine précédente pour démarrer plus vite."
            actionLabel="Ajouter une affectation"
            onAction={() => openCreate(formatDateInput(weekStartDate), vehicles[0]?.id)}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {displayAssignments.map((assignment) => (
              <Card key={assignment.id} className="p-4" raised>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-900">{assignment.workerName}</p>
                    <p className="mt-1 text-sm text-neutral-500">{assignment.vehicleName}</p>
                  </div>
                  <StatusBadge
                    variant={assignment.vehicleStatus === 'maintenance' ? 'warning' : 'success'}
                  >
                    {formatTime(assignment.departure_time)}
                  </StatusBadge>
                </div>
                <p className="mt-3 text-sm text-neutral-500">{assignment.projectName}</p>
                <p className="mt-1 text-xs text-neutral-400">{assignment.assignment_date}</p>
              </Card>
            ))}
          </div>
        )}
      </SectionCard>

      {modalState.mode !== 'closed' && (
        <DispatchAssignmentModal
          mode={modalState}
          weekStart={weekStart}
          assignments={displayAssignments}
          workers={workers}
          vehicles={vehicles}
          projects={projects}
          onClose={closeModal}
          onSaved={(message) => {
            closeModal();
            refreshWithNotice(message);
          }}
        />
      )}
    </div>
  );
}

function DispatchAssignmentModal({
  mode,
  weekStart,
  assignments,
  workers,
  vehicles,
  projects,
  onClose,
  onSaved,
}: {
  mode: Exclude<ModalState, { mode: 'closed' }>;
  weekStart: string;
  assignments: DispatchRowWithLabels[];
  workers: Worker[];
  vehicles: Vehicle[];
  projects: Project[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = mode.mode === 'edit';
  const assignment = isEdit ? mode.assignment : null;
  const [workerIds, setWorkerIds] = useState<string[]>(assignment ? [assignment.worker_id] : []);
  const [workerId, setWorkerId] = useState(assignment?.worker_id ?? workers[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState(assignment?.vehicle_id ?? vehicles[0]?.id ?? '');
  const [projectId, setProjectId] = useState(assignment?.project_id ?? projects[0]?.id ?? '');
  const [assignmentDate, setAssignmentDate] = useState(
    isEdit ? (assignment?.assignment_date ?? weekStart) : mode.date,
  );
  const [departureTime, setDepartureTime] = useState(assignment?.departure_time ?? '');
  const [confirmationChannel, setConfirmationChannel] = useState<'app' | 'whatsapp'>(
    (assignment?.confirmation_channel === 'whatsapp' ? 'whatsapp' : 'app') as 'app' | 'whatsapp',
  );
  const [ignoredConflictKeys, setIgnoredConflictKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useAsyncTransition();

  const selectedWorkers = isEdit ? [workerId] : workerIds;

  const activeVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === vehicleId),
    [vehicleId, vehicles],
  );

  const conflictItems = useMemo(() => {
    if (!vehicleId || selectedWorkers.length === 0) return [];

    const currentAssignments = assignments.filter(
      (row) =>
        row.assignment_date === assignmentDate &&
        row.vehicle_id === vehicleId &&
        (!isEdit || row.id !== assignment?.id),
    );

    const workerBusyIds = new Set(
      assignments
        .filter((row) => row.assignment_date === assignmentDate)
        .filter((row) => selectedWorkers.includes(row.worker_id))
        .filter((row) => !isEdit || row.id !== assignment?.id)
        .map((row) => row.worker_id),
    );

    const conflicts: Array<{
      key: string;
      message: string;
      kind: 'vehicle' | 'capacity' | 'worker';
      workerId?: string;
    }> = [];

    if (!activeVehicle) {
      conflicts.push({
        key: 'vehicle-missing',
        kind: 'vehicle',
        message: 'Véhicule introuvable ou hors de votre organisation.',
      });
      return conflicts;
    }

    if (activeVehicle.status === 'maintenance') {
      conflicts.push({
        key: 'vehicle-maintenance',
        kind: 'vehicle',
        message: 'Ce véhicule est en maintenance.',
      });
    }

    for (const worker of selectedWorkers) {
      if (workerBusyIds.has(worker)) {
        conflicts.push({
          key: `worker-${worker}`,
          kind: 'worker',
          workerId: worker,
          message: 'Cet ouvrier a déjà une autre affectation pour ce jour.',
        });
      }
    }

    if (currentAssignments.length + selectedWorkers.length > activeVehicle.capacity) {
      conflicts.push({
        key: 'vehicle-capacity',
        kind: 'capacity',
        message: 'La capacité de ce véhicule serait dépassée pour cette journée.',
      });
    }

    return conflicts;
  }, [
    activeVehicle,
    assignment?.id,
    assignmentDate,
    assignments,
    isEdit,
    selectedWorkers,
    vehicleId,
  ]);

  const unresolvedConflicts = conflictItems.filter(
    (conflict) => !ignoredConflictKeys.includes(conflict.key),
  );

  function toggleIgnoredConflict(key: string) {
    setIgnoredConflictKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  function handleSelectWorker(workerIdValue: string) {
    setWorkerIds((current) =>
      current.includes(workerIdValue)
        ? current.filter((item) => item !== workerIdValue)
        : [...current, workerIdValue],
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!vehicleId || !projectId) {
      setError('Le véhicule et le chantier sont obligatoires.');
      return;
    }

    if (!isEdit && selectedWorkers.length === 0) {
      setError('Sélectionnez au moins un ouvrier.');
      return;
    }

    if (unresolvedConflicts.length > 0) {
      setError('Résolvez ou ignorez les conflits ci-dessous avant d’enregistrer.');
      return;
    }

    startTransition(async () => {
      const ignoredWorkerIds = conflictItems
        .filter(
          (conflict) => conflict.kind === 'worker' && ignoredConflictKeys.includes(conflict.key),
        )
        .map((conflict) => conflict.workerId!)
        .filter(Boolean);

      const result =
        isEdit && assignment
          ? await updateDispatchAssignment({
              id: assignment.id,
              assignment_date: assignment.assignment_date,
              worker_id: assignment.worker_id,
              vehicle_id: vehicleId,
              departure_time: departureTime || undefined,
              actual_departure_time: assignment.actual_departure_time ?? undefined,
              confirmation_channel: assignment.confirmation_channel ?? undefined,
              version: assignment.version,
            } as UpdateDispatchAssignmentInput & {
              id: string;
              assignment_date: string;
              worker_id: string;
            })
          : await createDispatchAssignments({
              worker_ids: selectedWorkers,
              vehicle_id: vehicleId,
              project_id: projectId,
              assignment_date: assignmentDate,
              departure_time: departureTime || undefined,
              confirmation_channel: confirmationChannel,
              ignore_vehicle_maintenance: ignoredConflictKeys.includes('vehicle-maintenance'),
              ignore_capacity: ignoredConflictKeys.includes('vehicle-capacity'),
              ignored_worker_ids: ignoredWorkerIds.length > 0 ? ignoredWorkerIds : undefined,
            });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onSaved(isEdit ? 'Affectation mise à jour.' : 'Affectations créées.');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card raised className="max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              {isEdit ? 'Modifier l’affectation' : 'Nouvelle assignation'}
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {isEdit
                ? 'Vérifiez les conflits avant d’enregistrer la modification.'
                : 'Le formulaire affiche les conflits de véhicule, d’ouvrier et de capacité, avec une option pour les ignorer un par un.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-neutral-500 hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
          {!isEdit ? (
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium text-neutral-900">Ouvriers</label>
              <div className="rounded-2xl border border-neutral-300 bg-white p-3">
                <p className="mb-3 text-xs text-neutral-500">
                  Sélectionnez un ou plusieurs ouvriers. La capacité du véhicule sera vérifiée, mais
                  vous pouvez l’ignorer explicitement si nécessaire.
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto pe-1">
                  {workers.map((worker) => {
                    const checked = workerIds.includes(worker.id);
                    const selectedCount = workerIds.length;
                    const capacityLimitReached =
                      !checked && activeVehicle != null && selectedCount >= activeVehicle.capacity;

                    return (
                      <label
                        key={worker.id}
                        className={`flex cursor-pointer items-center justify-between rounded-2xl border px-3 py-2 transition-colors ${
                          checked ? 'border-accent-300 bg-accent-50' : 'border-neutral-200 bg-white'
                        } ${capacityLimitReached ? 'opacity-60' : ''}`}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleSelectWorker(worker.id)}
                            className="text-accent-600 h-4 w-4 rounded border-neutral-300"
                          />
                          <span>
                            <span className="block font-medium text-neutral-900">
                              {worker.full_name}
                            </span>
                            <span className="block text-xs text-neutral-500">
                              {worker.trade ?? 'Main-d’œuvre générale'}
                            </span>
                          </span>
                        </span>
                        <span className="text-xs text-neutral-500">
                          {worker.daily_rate != null ? `${worker.daily_rate} TND` : '—'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-neutral-900">Ouvrier</label>
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
              >
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-900">Véhicule</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.name} {vehicle.status === 'maintenance' ? '(maintenance)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-900">Chantier</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              {projects
                .filter((project) => project.status === 'active')
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>

          <FormField
            label="Date d’affectation"
            type="date"
            value={assignmentDate}
            onChange={(e) => setAssignmentDate(e.target.value)}
            disabled={isEdit}
          />

          <FormField
            label="Heure de départ"
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
          />

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-900">Canal d’envoi</label>
            <select
              value={confirmationChannel}
              onChange={(e) => setConfirmationChannel(e.target.value as 'app' | 'whatsapp')}
              className="bg-neutral-0 w-full rounded-2xl border border-neutral-300 px-3 py-2.5 text-[15.5px] outline-none"
            >
              <option value="app">App</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <p className="text-xs text-neutral-500">
              Canal informatif seulement. Aucun envoi SMS/WhatsApp n’est déclenché ici.
            </p>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-neutral-900">Outils à apporter</label>
            <textarea
              value=""
              readOnly
              placeholder="Bientôt disponible"
              className="bg-neutral-0 min-h-[72px] w-full rounded-2xl border border-dashed border-neutral-300 px-3 py-2.5 text-sm outline-none"
            />
            <p className="text-xs text-neutral-500">
              Ce champ n’existe pas encore dans le schéma réel. Il sera ajouté via migration plus
              tard si nécessaire.
            </p>
          </div>

          {conflictItems.length > 0 && (
            <div className="space-y-3 md:col-span-2">
              <p className="text-sm font-semibold text-neutral-900">Conflits détectés</p>
              <div className="space-y-2">
                {conflictItems.map((conflict) => {
                  const ignored = ignoredConflictKeys.includes(conflict.key);
                  return (
                    <div
                      key={conflict.key}
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        ignored
                          ? 'border-success/20 bg-success/10 text-success'
                          : 'border-warning/20 bg-warning/10 text-warning-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p>{conflict.message}</p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => toggleIgnoredConflict(conflict.key)}
                        >
                          {ignored ? 'Conflit ignoré' : 'Ignorer et envoyer quand même'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-danger text-sm md:col-span-2">{error}</p>}

          <div className="mt-2 flex justify-end gap-3 md:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" loading={isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
