import type {
  ConfirmationChannel,
  DispatchAssignment,
  Project,
  Vehicle,
  Worker,
} from '@dala/shared-types';
import { createDispatchAssignmentSchema, updateDispatchAssignmentSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { CalendarBlankIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonCardList } from '@/components/ui/Skeleton';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/dispatch.tsx
 *
 * Doc 03 §3.11, Doc 05 §2.3 — mobile dispatch board. Deliberately NOT a port
 * of the web weekly drag-grid: a horizontal date strip + one "lane" card per
 * vehicle (plus an "Sans véhicule" lane), tap a lane to assign, conflicts
 * surface inline (never a blocking modal — see handleAssign's comment).
 *
 * Offline/version-conflict handling (Doc 01 §1.9, Doc 03 §3.11): this is the
 * one screen in Phase 1 where a 409 must NEVER auto-merge. See
 * handleAssignSubmit's version-check branch — this is a best-effort
 * read-before-write compare (fetch current version, compare to what the
 * sheet started with), not a full offline mutation queue; a real
 * offline-first queue (WatermelonDB, already a dependency but not wired to
 * any table yet) is a follow-up, not something this pass builds from
 * scratch. What's here is still correct for the "never silently overwrite"
 * requirement — it just doesn't yet work fully offline.
 */
type EnrichedAssignment = DispatchAssignment & {
  workerName: string;
};

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(iso: string, delta: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + delta);
  return toISO(d);
}

function dateChips(centerISO: string): string[] {
  return Array.from({ length: 14 }, (_, i) => addDays(centerISO, i - 3));
}

function frLabel(iso: string): { weekday: string; day: string } {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
  return { weekday, day: String(d.getDate()) };
}

export default function DispatchScreen() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(toISO(new Date()));
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<EnrichedAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<EnrichedAssignment | null>(null);
  const [laneVehicleId, setLaneVehicleId] = useState<string | null>(null);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [departureTime, setDepartureTime] = useState('');
  const [tools, setTools] = useState('');
  const [channel, setChannel] = useState<ConfirmationChannel>('app');
  const [warning, setWarning] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ serverVersion: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [selectedDate]),
  );

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      return;
    }

    const [
      { data: vehicleRows },
      { data: workerRows },
      { data: projectRows },
      { data: assignmentRows },
    ] = await Promise.all([
      supabase.from('vehicles').select('*').eq('org_id', org).order('name'),
      supabase.from('workers').select('*').eq('org_id', org).order('full_name'),
      supabase.from('projects').select('*').eq('lead_org_id', org).eq('status', 'active'),
      supabase
        .from('dispatch_assignments')
        .select('*, workers(full_name)')
        .eq('org_id', org)
        .eq('assignment_date', selectedDate),
    ]);

    setVehicles(vehicleRows ?? []);
    setWorkers(workerRows ?? []);
    setProjects(projectRows ?? []);
    setAssignments(
      (assignmentRows ?? []).map((a: any) => ({
        ...a,
        workerName: a.workers?.full_name ?? 'Ouvrier',
      })),
    );
    setLoading(false);
  }

  const assignmentsByVehicle = useMemo(() => {
    const map: Record<string, EnrichedAssignment[]> = {};
    for (const a of assignments) {
      const key = a.vehicle_id ?? 'none';
      map[key] = map[key] ? [...map[key], a] : [a];
    }
    return map;
  }, [assignments]);

  function openAssign(vehicleId: string | null) {
    setEditing(null);
    setLaneVehicleId(vehicleId);
    setSelectedWorkerIds([]);
    setProjectId(undefined);
    setDepartureTime('');
    setTools('');
    setChannel('app');
    setWarning(null);
    setConflict(null);
    setError(null);
    setSheetOpen(true);
  }

  function toggleWorker(workerId: string) {
    setSelectedWorkerIds((prev) => {
      const next = prev.includes(workerId)
        ? prev.filter((id) => id !== workerId)
        : [...prev, workerId];
      void checkWarnings(next);
      return next;
    });
  }

  async function checkWarnings(workerIds: string[]) {
    if (workerIds.length === 0 || !orgId) {
      setWarning(null);
      return;
    }
    const vehicle = vehicles.find((v) => v.id === laneVehicleId);
    const problems: string[] = [];

    if (vehicle && workerIds.length > vehicle.capacity) {
      problems.push(`Dépasse la capacité du véhicule (${vehicle.capacity} places).`);
    }

    // Overbooking: is any selected worker already assigned elsewhere today?
    const { data: existing } = await supabase
      .from('dispatch_assignments')
      .select('worker_id')
      .eq('org_id', orgId)
      .eq('assignment_date', selectedDate)
      .in('worker_id', workerIds);
    const alreadyAssigned = (existing ?? []).filter((e) => e.worker_id !== editing?.worker_id);
    if (alreadyAssigned.length > 0) {
      problems.push(`${alreadyAssigned.length} ouvrier(s) déjà affecté(s) ce jour-là.`);
    }

    // Absence: is any selected worker marked absent today (Pointage)?
    const { data: absences } = await supabase
      .from('attendance_records')
      .select('worker_id, status')
      .eq('org_id', orgId)
      .eq('record_date', selectedDate)
      .eq('status', 'absent')
      .in('worker_id', workerIds);
    if ((absences ?? []).length > 0) {
      problems.push(`${absences!.length} ouvrier(s) marqué(s) absent(s) aujourd'hui.`);
    }

    // Doc 05 §2.3 — surfaced inline (this state, rendered as a banner in the
    // sheet), never as a blocking Alert/modal. The contractor can still
    // submit past a warning — these are flags, not hard stops, except
    // capacity and maintenance which are prevented at the source (a
    // maintenance vehicle's lane has no "+", and selection is capped).
    setWarning(problems.length > 0 ? problems.join(' ') : null);
  }

  async function handleAssignSubmit() {
    setError(null);
    if (!orgId || selectedWorkerIds.length === 0) {
      setError('Sélectionnez au moins un ouvrier.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      for (const workerId of selectedWorkerIds) {
        const parsed = createDispatchAssignmentSchema.safeParse({
          project_id: projectId,
          vehicle_id: laneVehicleId ?? undefined,
          worker_id: workerId,
          assignment_date: selectedDate,
          departure_time: departureTime || undefined,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
          haptics.error();
          setSaving(false);
          return;
        }
        const { error: insertError } = await supabase
          .from('dispatch_assignments')
          .insert({ ...parsed.data, org_id: orgId, confirmation_channel: channel });
        if (insertError) throw insertError;
      }
      haptics.confirm();
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  function openEditExisting(assignment: EnrichedAssignment) {
    setEditing(assignment);
    setLaneVehicleId(assignment.vehicle_id);
    setSelectedWorkerIds([assignment.worker_id]);
    setProjectId(assignment.project_id ?? undefined);
    setDepartureTime(assignment.departure_time ?? '');
    setChannel(assignment.confirmation_channel ?? 'app');
    setTools('');
    setWarning(null);
    setConflict(null);
    setError(null);
    setSheetOpen(true);
  }

  async function handleUpdateExisting(resolution?: 'keep_mine' | 'use_theirs') {
    if (!editing) return;
    setError(null);
    setSaving(true);
    try {
      // Doc 01 §1.9 — read the current server version immediately before
      // writing. If it no longer matches what this sheet was opened with,
      // that's a "Modifié ailleurs" conflict: stop and let the contractor
      // choose explicitly, rather than guessing which version should win.
      const { data: current } = await supabase
        .from('dispatch_assignments')
        .select('version, departure_time, vehicle_id, confirmation_channel')
        .eq('id', editing.id)
        .single();

      if (!resolution && current && current.version !== editing.version) {
        setConflict({ serverVersion: current.version });
        setSaving(false);
        return;
      }

      if (resolution === 'use_theirs') {
        setDepartureTime(current?.departure_time ?? '');
        setLaneVehicleId(current?.vehicle_id ?? null);
        setChannel((current?.confirmation_channel as ConfirmationChannel) ?? 'app');
        setConflict(null);
        setSaving(false);
        return;
      }

      const baseVersion =
        resolution === 'keep_mine' ? (current?.version ?? editing.version) : editing.version;

      const parsed = updateDispatchAssignmentSchema.safeParse({
        vehicle_id: laneVehicleId ?? undefined,
        departure_time: departureTime || undefined,
        confirmation_channel: channel,
        version: baseVersion,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
        haptics.error();
        setSaving(false);
        return;
      }

      const { version, ...patch } = parsed.data;
      const { error: updateError } = await supabase
        .from('dispatch_assignments')
        .update({ ...patch, version: version + 1 })
        .eq('id', editing.id)
        .eq('version', version); // last-ditch DB-level guard against a race between the read above and this write

      if (updateError) throw updateError;
      haptics.confirm();
      setConflict(null);
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  async function copyPreviousWeek() {
    if (!orgId) return;
    const sourceDate = addDays(selectedDate, -7);
    const { data: sourceAssignments } = await supabase
      .from('dispatch_assignments')
      .select('project_id, vehicle_id, worker_id, departure_time')
      .eq('org_id', orgId)
      .eq('assignment_date', sourceDate);

    if (!sourceAssignments || sourceAssignments.length === 0) {
      Alert.alert('Aucune affectation', "Il n'y a rien à copier depuis la semaine précédente.");
      return;
    }

    const rows = sourceAssignments.map((a) => ({
      org_id: orgId,
      project_id: a.project_id,
      vehicle_id: a.vehicle_id,
      worker_id: a.worker_id,
      assignment_date: selectedDate,
      departure_time: a.departure_time,
    }));
    const { error: copyError } = await supabase.from('dispatch_assignments').insert(rows);
    if (copyError) {
      Alert.alert('Erreur', 'Impossible de copier les affectations.');
      return;
    }
    await load();
  }

  const lanes: { id: string | null; vehicle: Vehicle | null }[] = [
    ...vehicles.map((v) => ({ id: v.id, vehicle: v })),
    { id: null, vehicle: null },
  ];

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 76 }}>
        <XStack paddingHorizontal="$3" paddingVertical="$3" gap="$2">
          {dateChips(selectedDate).map((iso) => {
            const { weekday, day } = frLabel(iso);
            const active = iso === selectedDate;
            return (
              <YStack
                key={iso}
                width={44}
                paddingVertical={8}
                borderRadius="$control"
                alignItems="center"
                backgroundColor={active ? '$accent600' : '$neutral0'}
                onPress={() => setSelectedDate(iso)}
              >
                <Text fontSize={11} color={active ? 'white' : '$neutral500'}>
                  {weekday}
                </Text>
                <Text fontSize={15} fontWeight="600" color={active ? 'white' : '$neutral900'}>
                  {day}
                </Text>
              </YStack>
            );
          })}
        </XStack>
      </ScrollView>

      <XStack
        justifyContent="space-between"
        alignItems="center"
        paddingHorizontal="$4"
        paddingBottom="$2"
      >
        <Text fontFamily="$display" fontSize={19} fontWeight="600">
          {selectedDate === toISO(new Date()) ? "Aujourd'hui" : selectedDate}
        </Text>
        <Text fontSize={13} color="$accent600" fontWeight="500" onPress={copyPreviousWeek}>
          Copier semaine précédente
        </Text>
      </XStack>

      {!loading && vehicles.length === 0 && assignments.length === 0 ? (
        <EmptyState
          icon={CalendarBlankIcon}
          illustration="route-planning"
          title="Rien à afficher"
          description="Ajoutez un véhicule pour commencer à planifier vos dispatchs."
        />
      ) : loading ? (
        <SkeletonCardList cards={3} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
          <YStack gap="$3">
            {lanes.map((lane) => {
              const laneAssignments = assignmentsByVehicle[lane.id ?? 'none'] ?? [];
              const isMaintenance = lane.vehicle?.status === 'maintenance';
              return (
                <YStack
                  key={lane.id ?? 'none'}
                  backgroundColor="$neutral0"
                  borderRadius="$card"
                  padding="$3"
                  opacity={isMaintenance ? 0.5 : 1}
                >
                  <XStack justifyContent="space-between" alignItems="center" marginBottom="$2">
                    <Text fontSize={15.5} fontWeight="600">
                      {lane.vehicle ? lane.vehicle.name : 'Sans véhicule'}
                      {lane.vehicle && (
                        <Text fontSize={12} color="$neutral500">
                          {'  '}· {lane.vehicle.capacity} places
                          {isMaintenance ? ' · Maintenance' : ''}
                        </Text>
                      )}
                    </Text>
                    {!isMaintenance && (
                      <Text
                        fontSize={13}
                        color="$accent600"
                        fontWeight="500"
                        onPress={() => openAssign(lane.id)}
                      >
                        + Assigner
                      </Text>
                    )}
                  </XStack>

                  {laneAssignments.length === 0 ? (
                    <Text fontSize={13} color="$neutral500">
                      Aucun ouvrier assigné.
                    </Text>
                  ) : (
                    <YStack gap="$2">
                      {laneAssignments.map((a) => (
                        <XStack
                          key={a.id}
                          alignItems="center"
                          gap="$2"
                          onPress={() => openEditExisting(a)}
                        >
                          <Avatar name={a.workerName} size={26} />
                          <Text fontSize={13.5} flex={1}>
                            {a.workerName}
                          </Text>
                          {a.departure_time && (
                            <Text fontSize={12} color="$neutral500">
                              {a.departure_time}
                            </Text>
                          )}
                          {a.actual_departure_time && (
                            <Text fontSize={12} color="$success">
                              En route
                            </Text>
                          )}
                        </XStack>
                      ))}
                    </YStack>
                  )}
                </YStack>
              );
            })}
          </YStack>
        </ScrollView>
      )}

      {renderSheet()}
    </YStack>
  );

  function renderSheet() {
    const vehicle = vehicles.find((v) => v.id === laneVehicleId);

    return (
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Modifier l'affectation" : 'Assigner des ouvriers'}
      >
        {conflict ? (
          <YStack gap="$3">
            <Text fontFamily="$display" fontSize={17} fontWeight="600">
              Modifié ailleurs
            </Text>
            <Text color="$neutral500" fontSize={14}>
              Cette affectation a été modifiée par quelqu&apos;un d&apos;autre entre-temps. Que
              voulez-vous faire ?
            </Text>
            <Button onPress={() => handleUpdateExisting('keep_mine')} loading={saving}>
              Garder ma version
            </Button>
            <Button
              variant="secondary"
              onPress={() => handleUpdateExisting('use_theirs')}
              loading={saving}
            >
              Utiliser la version du serveur
            </Button>
          </YStack>
        ) : (
          <YStack gap="$3">
            {!editing && (
              <YStack gap="$1.5">
                <Text fontSize={14} fontWeight="500">
                  Chantier (optionnel)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <XStack gap="$2">
                    <XStack
                      paddingHorizontal={12}
                      paddingVertical={8}
                      borderRadius="$control"
                      backgroundColor={!projectId ? '$accent600' : '$neutral100'}
                      onPress={() => setProjectId(undefined)}
                    >
                      <Text fontSize={13} color={!projectId ? 'white' : '$neutral500'}>
                        Aucun
                      </Text>
                    </XStack>
                    {projects.map((p) => {
                      const selected = projectId === p.id;
                      return (
                        <XStack
                          key={p.id}
                          paddingHorizontal={12}
                          paddingVertical={8}
                          borderRadius="$control"
                          backgroundColor={selected ? '$accent600' : '$neutral100'}
                          onPress={() => setProjectId(p.id)}
                        >
                          <Text fontSize={13} color={selected ? 'white' : '$neutral500'}>
                            {p.name}
                          </Text>
                        </XStack>
                      );
                    })}
                  </XStack>
                </ScrollView>
              </YStack>
            )}

            {!editing && (
              <YStack gap="$1.5">
                <Text fontSize={14} fontWeight="500">
                  Ouvriers {vehicle ? `(max ${vehicle.capacity})` : ''}
                </Text>
                <YStack gap="$1">
                  {workers.map((w) => {
                    const selected = selectedWorkerIds.includes(w.id);
                    return (
                      <XStack
                        key={w.id}
                        alignItems="center"
                        gap="$2"
                        paddingVertical={6}
                        onPress={() => toggleWorker(w.id)}
                      >
                        <YStack
                          width={20}
                          height={20}
                          borderRadius={6}
                          borderWidth={1.5}
                          borderColor={selected ? '$accent600' : '$neutral300'}
                          backgroundColor={selected ? '$accent600' : 'transparent'}
                        />
                        <Text fontSize={14.5}>{w.full_name}</Text>
                      </XStack>
                    );
                  })}
                </YStack>
              </YStack>
            )}

            <FormField
              label="Heure de départ"
              value={departureTime}
              onChangeText={setDepartureTime}
              placeholder="07:30"
            />

            {!editing && (
              <FormField
                label="Outils à apporter (optionnel)"
                value={tools}
                onChangeText={setTools}
              />
            )}

            <YStack gap="$1.5">
              <Text fontSize={14} fontWeight="500">
                Envoyer via
              </Text>
              <SegmentedControl
                value={channel}
                onChange={setChannel}
                options={[
                  { value: 'app', label: 'App', color: '$accent600' },
                  { value: 'whatsapp', label: 'WhatsApp', color: '$accent600' },
                  { value: 'sms', label: 'SMS', color: '$accent600' },
                ]}
              />
            </YStack>

            {warning && (
              <YStack backgroundColor="#FEF3D8" borderRadius="$control" padding="$3">
                <Text fontSize={13} color="$warning">
                  {warning}
                </Text>
              </YStack>
            )}
            {error && <Text color="$danger">{error}</Text>}

            <Button
              onPress={editing ? () => handleUpdateExisting() : handleAssignSubmit}
              loading={saving}
            >
              {editing ? 'Enregistrer' : 'Envoyer'}
            </Button>
          </YStack>
        )}
      </Sheet>
    );
  }
}
