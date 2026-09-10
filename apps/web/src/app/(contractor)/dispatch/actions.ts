'use server';

import type { DispatchAssignment } from '@dala/shared-types';
import {
  createDispatchAssignmentSchema,
  createDispatchAssignmentsSchema,
  updateDispatchAssignmentSchema,
  type CreateDispatchAssignmentInput,
  type CreateDispatchAssignmentsInput,
  type UpdateDispatchAssignmentInput,
} from '@dala/validation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireVerifiedEmail } from '@/lib/emailVerification';
import { checkProjectIsWritable } from '@/lib/projectStatus';
import { createClient } from '@/lib/supabase/server';

type MutationResult =
  { success: true; assignment: DispatchAssignment } | { success: false; error: string };

type BulkMutationResult =
  { success: true; insertedCount: number } | { success: false; error: string };

type CopyWeekResult = { success: true; copiedCount: number } | { success: false; error: string };

const dispatchLookupSchema = z.object({
  id: z.string().uuid().optional(),
  assignment_date: z.string().date(),
  vehicle_id: z.string().uuid(),
  worker_id: z.string().uuid(),
});

type DispatchConflict = {
  kind: 'vehicle_maintenance' | 'capacity' | 'worker_conflict';
  workerId?: string;
  message: string;
};

async function resolveActiveOrgId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Session expirée, reconnectez-vous.' as const };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.active_org_id) {
    return { error: 'Aucune organisation active.' as const };
  }

  // §2.8 — gates every dispatch write behind email verification, once,
  // for all four dispatch actions that share this helper.
  const emailError = await requireVerifiedEmail(supabase, user.id);
  if (emailError) return { error: emailError };

  return { supabase, userId: user.id, orgId: profile.active_org_id };
}

async function loadDispatchContext({
  supabase,
  orgId,
  assignmentDate,
  vehicleId,
  workerId,
  assignmentId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  assignmentDate: string;
  vehicleId: string;
  workerId: string;
  assignmentId?: string;
}) {
  const [{ data: vehicle }, { data: workerAssignments }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id, org_id, name, plate, capacity, status, created_at')
      .eq('org_id', orgId)
      .eq('id', vehicleId)
      .maybeSingle(),
    supabase
      .from('dispatch_assignments')
      .select('id, vehicle_id, worker_id')
      .eq('org_id', orgId)
      .eq('assignment_date', assignmentDate)
      .eq('worker_id', workerId)
      .neq('id', assignmentId ?? '00000000-0000-0000-0000-000000000000'),
  ]);

  const { data: vehicleAssignments } = await supabase
    .from('dispatch_assignments')
    .select('id, vehicle_id, worker_id')
    .eq('org_id', orgId)
    .eq('assignment_date', assignmentDate)
    .eq('vehicle_id', vehicleId)
    .neq('id', assignmentId ?? '00000000-0000-0000-0000-000000000000');

  return {
    vehicle,
    workerAssignments: workerAssignments ?? [],
    vehicleAssignments: vehicleAssignments ?? [],
  };
}

async function loadDispatchBatchContext({
  supabase,
  orgId,
  assignmentDate,
  vehicleId,
  workerIds,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  assignmentDate: string;
  vehicleId: string;
  workerIds: string[];
}) {
  const [{ data: vehicle }, { data: workerAssignments }, { data: vehicleAssignments }] =
    await Promise.all([
      supabase
        .from('vehicles')
        .select('id, org_id, name, plate, capacity, status, created_at')
        .eq('org_id', orgId)
        .eq('id', vehicleId)
        .is('deleted_at', null)
        .maybeSingle(),
      supabase
        .from('dispatch_assignments')
        .select('id, vehicle_id, worker_id')
        .eq('org_id', orgId)
        .eq('assignment_date', assignmentDate)
        .in('worker_id', workerIds),
      supabase
        .from('dispatch_assignments')
        .select('id, vehicle_id, worker_id')
        .eq('org_id', orgId)
        .eq('assignment_date', assignmentDate)
        .eq('vehicle_id', vehicleId),
    ]);

  return {
    vehicle,
    workerAssignments: workerAssignments ?? [],
    vehicleAssignments: vehicleAssignments ?? [],
  };
}

function getDispatchConflictMessage({
  vehicle,
  workerAssignments,
  vehicleAssignments,
}: Awaited<ReturnType<typeof loadDispatchContext>>): string | null {
  if (!vehicle) {
    return 'Véhicule introuvable ou hors de votre organisation.';
  }

  if (vehicle.status === 'maintenance') {
    return 'Ce véhicule est en maintenance. Il faut lever le blocage avant de l’affecter.';
  }

  if (workerAssignments.length > 0) {
    return 'Cet ouvrier a déjà une autre affectation pour ce jour.';
  }

  if (vehicleAssignments.length >= vehicle.capacity) {
    return 'La capacité de ce véhicule est déjà atteinte pour cette journée.';
  }

  return null;
}

function getDispatchBatchConflicts({
  vehicle,
  workerAssignments,
  vehicleAssignments,
  selectedWorkerIds,
}: Awaited<ReturnType<typeof loadDispatchBatchContext>> & {
  selectedWorkerIds: string[];
}): DispatchConflict[] {
  const conflicts: DispatchConflict[] = [];

  if (!vehicle) {
    conflicts.push({
      kind: 'vehicle_maintenance',
      message: 'Véhicule introuvable ou hors de votre organisation.',
    });
    return conflicts;
  }

  if (vehicle.status === 'maintenance') {
    conflicts.push({
      kind: 'vehicle_maintenance',
      message: 'Ce véhicule est en maintenance. Il faut lever le blocage avant de l’affecter.',
    });
  }

  const busyWorkers = new Set(workerAssignments.map((assignment) => assignment.worker_id));
  for (const workerId of selectedWorkerIds) {
    if (busyWorkers.has(workerId)) {
      conflicts.push({
        kind: 'worker_conflict',
        workerId,
        message: 'Cet ouvrier a déjà une autre affectation pour ce jour.',
      });
    }
  }

  const currentVehicleCount = vehicleAssignments.length;
  if (currentVehicleCount + selectedWorkerIds.length > vehicle.capacity) {
    conflicts.push({
      kind: 'capacity',
      message: 'La capacité de ce véhicule serait dépassée pour cette journée.',
    });
  }

  return conflicts;
}

async function insertDispatchAssignments(
  input: CreateDispatchAssignmentsInput,
): Promise<BulkMutationResult> {
  const parsed = createDispatchAssignmentsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const context = await resolveActiveOrgId();
  if ('error' in context) return { success: false, error: context.error ?? 'Erreur inconnue.' };

  const { supabase, orgId } = context;

  const projectError = await checkProjectIsWritable(supabase, parsed.data.project_id, orgId);
  if (projectError) return { success: false, error: projectError };

  const workerIds = Array.from(new Set(parsed.data.worker_ids));
  const contextData = await loadDispatchBatchContext({
    supabase,
    orgId,
    assignmentDate: parsed.data.assignment_date,
    vehicleId: parsed.data.vehicle_id,
    workerIds,
  });

  const conflicts = getDispatchBatchConflicts({
    ...contextData,
    selectedWorkerIds: workerIds,
  });

  const ignoredWorkerIds = new Set(parsed.data.ignored_worker_ids ?? []);
  const hasVehicleMaintenanceConflict = conflicts.some(
    (conflict) => conflict.kind === 'vehicle_maintenance',
  );
  const hasCapacityConflict = conflicts.some((conflict) => conflict.kind === 'capacity');
  const blockingWorkerConflicts = conflicts.filter(
    (conflict) =>
      conflict.kind === 'worker_conflict' && !ignoredWorkerIds.has(conflict.workerId ?? ''),
  );

  if (hasVehicleMaintenanceConflict && !parsed.data.ignore_vehicle_maintenance) {
    return { success: false, error: 'Ce véhicule est en maintenance.' };
  }
  if (hasCapacityConflict && !parsed.data.ignore_capacity) {
    return { success: false, error: 'La capacité de ce véhicule serait dépassée.' };
  }
  if (blockingWorkerConflicts.length > 0) {
    return {
      success: false,
      error: 'Un ou plusieurs ouvriers sont déjà affectés à un autre véhicule ce jour.',
    };
  }

  if (!contextData.vehicle) {
    return { success: false, error: 'Véhicule introuvable ou hors de votre organisation.' };
  }

  const rows = workerIds.map((workerId) => ({
    org_id: orgId,
    project_id: parsed.data.project_id,
    vehicle_id: parsed.data.vehicle_id,
    worker_id: workerId,
    assignment_date: parsed.data.assignment_date,
    departure_time: parsed.data.departure_time ?? null,
    confirmation_channel: parsed.data.confirmation_channel ?? null,
    version: 1,
  }));

  const { error } = await supabase.from('dispatch_assignments').insert(rows);
  if (error) {
    return { success: false, error: "Impossible d'enregistrer les affectations." };
  }

  revalidatePath('/dispatch');
  return { success: true, insertedCount: rows.length };
}

async function insertDispatchAssignment(
  input: CreateDispatchAssignmentInput,
): Promise<MutationResult> {
  const parsed = createDispatchAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const context = await resolveActiveOrgId();
  if ('error' in context) return { success: false, error: context.error ?? 'Erreur inconnue.' };

  const { supabase, orgId } = context;
  const vehicleId = parsed.data.vehicle_id!;
  const workerId = parsed.data.worker_id!;
  const assignmentDate = parsed.data.assignment_date!;

  if (!vehicleId || !workerId || !assignmentDate || !parsed.data.project_id) {
    return { success: false, error: 'Le chantier et le véhicule sont requis.' };
  }

  const projectError = await checkProjectIsWritable(supabase, parsed.data.project_id, orgId);
  if (projectError) return { success: false, error: projectError };

  const contextData = await loadDispatchContext({
    supabase,
    orgId,
    assignmentDate,
    vehicleId,
    workerId,
  });
  const conflict = getDispatchConflictMessage(contextData);
  if (conflict) {
    return { success: false, error: conflict };
  }

  const { data, error } = await supabase
    .from('dispatch_assignments')
    .insert({
      org_id: orgId,
      project_id: parsed.data.project_id!,
      vehicle_id: vehicleId,
      worker_id: workerId,
      assignment_date: assignmentDate,
      departure_time: parsed.data.departure_time ?? null,
      version: 1,
    })
    .select(
      'id, org_id, project_id, vehicle_id, worker_id, assignment_date, departure_time, confirmation_channel, actual_departure_time, version, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    return { success: false, error: "Impossible d'enregistrer l'affectation." };
  }

  revalidatePath('/dispatch');
  return { success: true, assignment: data };
}

export async function createDispatchAssignment(
  input: CreateDispatchAssignmentInput,
): Promise<MutationResult> {
  return insertDispatchAssignment(input);
}

export async function createDispatchAssignments(
  input: CreateDispatchAssignmentsInput,
): Promise<BulkMutationResult> {
  return insertDispatchAssignments(input);
}

export async function updateDispatchAssignment(
  input: UpdateDispatchAssignmentInput & { id: string; assignment_date: string; worker_id: string },
): Promise<MutationResult> {
  const parsed = updateDispatchAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' };
  }

  const context = await resolveActiveOrgId();
  if ('error' in context) return { success: false, error: context.error ?? 'Erreur inconnue.' };

  const { supabase, orgId } = context;
  const lookup = dispatchLookupSchema.safeParse(input);
  if (!lookup.success) {
    return { success: false, error: 'Affectation introuvable.' };
  }

  const assignmentDate = lookup.data.assignment_date!;

  const contextData = await loadDispatchContext({
    supabase,
    orgId,
    assignmentDate,
    vehicleId: parsed.data.vehicle_id ?? lookup.data.vehicle_id,
    workerId: lookup.data.worker_id,
    assignmentId: lookup.data.id,
  });
  const conflict = getDispatchConflictMessage(contextData);
  if (conflict) {
    return { success: false, error: conflict };
  }

  const { data, error } = await supabase
    .from('dispatch_assignments')
    .update({
      ...(parsed.data.vehicle_id !== undefined && { vehicle_id: parsed.data.vehicle_id }),
      ...(parsed.data.departure_time !== undefined && {
        departure_time: parsed.data.departure_time ?? null,
      }),
      ...(parsed.data.actual_departure_time !== undefined && {
        actual_departure_time: parsed.data.actual_departure_time ?? null,
      }),
      ...(parsed.data.confirmation_channel !== undefined && {
        confirmation_channel: parsed.data.confirmation_channel ?? null,
      }),
      version: parsed.data.version + 1,
    })
    .eq('id', lookup.data.id)
    .eq('org_id', orgId)
    .eq('version', parsed.data.version)
    .select(
      'id, org_id, project_id, vehicle_id, worker_id, assignment_date, departure_time, confirmation_channel, actual_departure_time, version, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    return {
      success: false,
      error: 'Cette affectation a été modifiée entre-temps. Rechargez la page avant de réessayer.',
    };
  }

  revalidatePath('/dispatch');
  return { success: true, assignment: data };
}

export async function copyPreviousWeekDispatchAssignments(input: {
  week_start: string;
}): Promise<CopyWeekResult> {
  const context = await resolveActiveOrgId();
  if ('error' in context) return { success: false, error: context.error ?? 'Erreur inconnue.' };

  const { supabase, orgId } = context;
  const currentWeekStart = new Date(`${input.week_start}T00:00:00`);
  if (Number.isNaN(currentWeekStart.getTime())) {
    return { success: false, error: 'Semaine invalide.' };
  }

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() + 6);

  const { data: sourceRows, error } = await supabase
    .from('dispatch_assignments')
    .select('project_id, vehicle_id, worker_id, assignment_date, departure_time')
    .eq('org_id', orgId)
    .gte('assignment_date', previousWeekStart.toISOString().slice(0, 10))
    .lte('assignment_date', previousWeekEnd.toISOString().slice(0, 10));

  if (error) {
    return { success: false, error: 'Impossible de lire la semaine précédente.' };
  }

  if (!sourceRows || sourceRows.length === 0) {
    return { success: false, error: 'Aucune affectation à recopier pour la semaine précédente.' };
  }

  let copiedCount = 0;
  for (const row of sourceRows) {
    if (!row.assignment_date) {
      continue;
    }

    const sourceAssignmentDate = row.assignment_date!;
    const sourceDate = new Date(`${sourceAssignmentDate}T00:00:00`);
    const targetDate = new Date(sourceDate);
    targetDate.setDate(targetDate.getDate() + 7);

    if (!row.project_id || !row.vehicle_id) {
      continue;
    }

    const result = await insertDispatchAssignments({
      project_id: row.project_id,
      vehicle_id: row.vehicle_id,
      worker_ids: [row.worker_id],
      assignment_date: targetDate.toISOString().slice(0, 10),
      departure_time: row.departure_time ?? undefined,
      ignore_vehicle_maintenance: true,
      ignore_capacity: true,
      ignored_worker_ids: [row.worker_id],
    });

    if (result.success) {
      copiedCount += 1;
    }
  }

  revalidatePath('/dispatch');
  return { success: true, copiedCount };
}
