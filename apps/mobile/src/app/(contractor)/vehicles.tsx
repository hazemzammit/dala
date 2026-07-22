import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import { createVehicleSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { CarIcon, PlusIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/vehicles.tsx
 *
 * Doc 03 §3.12 — list + add/edit. Doc 02 §2.2 — marking a vehicle
 * "Maintenance" must remove it from dispatch's assignable list and re-run
 * conflict detection if it was already scheduled; this screen only owns the
 * vehicle's own status field — the dispatch board (dispatch.tsx) is what
 * reads `status = 'maintenance'` to exclude it from assignment, so the two
 * screens are coupled by that shared read, not by anything in this file.
 */
const STATUS_BADGE: Record<
  VehicleStatus,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  available: { label: 'Disponible', variant: 'success' },
  in_use: { label: 'En service', variant: 'warning' },
  maintenance: { label: 'Maintenance', variant: 'neutral' },
};

const STATUS_OPTIONS: { value: VehicleStatus; label: string; color: string }[] = [
  { value: 'available', label: 'Disponible', color: '$success' },
  { value: 'in_use', label: 'En service', color: '$warning' },
  { value: 'maintenance', label: 'Maintenance', color: '$neutral500' },
];

export default function VehiclesScreen() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [status, setStatus] = useState<VehicleStatus>('available');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      return;
    }
    const { data } = await supabase.from('vehicles').select('*').eq('org_id', org).order('name');
    setVehicles(data ?? []);
    setLoading(false);
  }

  function openAdd() {
    setEditing(null);
    setName('');
    setPlate('');
    setCapacity('1');
    setStatus('available');
    setError(null);
    setSheetOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setName(vehicle.name);
    setPlate(vehicle.plate ?? '');
    setCapacity(String(vehicle.capacity));
    setStatus(vehicle.status);
    setError(null);
    setSheetOpen(true);
  }

  async function handleSave() {
    setError(null);
    if (!orgId) return;

    const parsed = createVehicleSchema.safeParse({
      name,
      plate: plate || undefined,
      capacity: Number(capacity),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const wasMaintenance = editing.status === 'maintenance';
        const { error: updateError } = await supabase
          .from('vehicles')
          .update({ ...parsed.data, status })
          .eq('id', editing.id);
        if (updateError) throw updateError;

        // Doc 02 §2.2 — marking "Maintenance" removes it from dispatch's
        // assignable list; surface that consequence here rather than
        // silently, since the contractor is acting from this screen, not
        // the dispatch board, and might not otherwise notice the effect.
        if (status === 'maintenance' && !wasMaintenance) {
          const { count } = await supabase
            .from('dispatch_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('vehicle_id', editing.id)
            .gte('assignment_date', new Date().toISOString().slice(0, 10));
          if (count && count > 0) {
            Alert.alert(
              'Conflit possible',
              `Ce véhicule a ${count} affectation(s) à venir. Vérifiez le tableau de dispatch.`,
            );
          }
        }
      } else {
        const { error: insertError } = await supabase
          .from('vehicles')
          .insert({ ...parsed.data, org_id: orgId, status });
        if (insertError) throw insertError;
      }
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setSaving(false);
    }
  }

  if (!loading && vehicles.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={CarIcon}
          title="Aucun véhicule"
          description="Ajoutez votre premier véhicule pour commencer à planifier vos dispatchs."
        />
        <FAB icon={PlusIcon} accessibilityLabel="Ajouter un véhicule" onPress={openAdd} />
        {renderSheet()}
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Véhicules
        </Text>

        <YStack gap="$2">
          {vehicles.map((vehicle) => (
            <XStack
              key={vehicle.id}
              backgroundColor="$neutral0"
              borderRadius="$card"
              padding="$4"
              justifyContent="space-between"
              alignItems="center"
              onPress={() => openEdit(vehicle)}
            >
              <YStack gap="$1">
                <Text fontSize={15.5} fontWeight="600">
                  {vehicle.name}
                </Text>
                <Text fontSize={13} color="$neutral500">
                  {vehicle.plate ?? '—'} · {vehicle.capacity} place(s)
                </Text>
              </YStack>
              <StatusBadge variant={STATUS_BADGE[vehicle.status].variant}>
                {STATUS_BADGE[vehicle.status].label}
              </StatusBadge>
            </XStack>
          ))}
        </YStack>
      </ScrollView>

      <FAB icon={PlusIcon} accessibilityLabel="Ajouter un véhicule" onPress={openAdd} />
      {renderSheet()}
    </YStack>
  );

  function renderSheet() {
    return (
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
      >
        <YStack gap="$3">
          <FormField
            label="Nom"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Camionnette 1"
          />
          <FormField label="Plaque d'immatriculation" value={plate} onChangeText={setPlate} />
          <FormField
            label="Capacité"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="numeric"
          />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Statut
            </Text>
            <SegmentedControl value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          </YStack>

          {error && <Text color="$danger">{error}</Text>}

          <Button onPress={handleSave} loading={saving}>
            {editing ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </YStack>
      </Sheet>
    );
  }
}
