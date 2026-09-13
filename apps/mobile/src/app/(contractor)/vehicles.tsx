import { color } from '@dala/design-tokens';
import type { Vehicle, VehicleStatus } from '@dala/shared-types';
import { createVehicleSchema, type CreateVehicleInput } from '@dala/validation';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import {
  CameraIcon,
  CarIcon,
  IdentificationCardIcon,
  ImageIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  WrenchIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { Image, Text, View, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { ListCard } from '@/components/ui/ListCard';
import { PlateInput } from '@/components/ui/PlateInput';
import { SearchFilterBar } from '@/components/ui/SearchFilterBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, getSignedUrlMap, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { toRgba, useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/vehicles.tsx
 *
 * Doc 03 §3.12 — list + add/edit. Doc 02 §2.2 — marking a vehicle
 * "Maintenance" must remove it from dispatch's assignable list and re-run
 * conflict detection if it was already scheduled; this screen only owns the
 * vehicle's own status field — the dispatch board (dispatch.tsx) is what
 * reads `status = 'maintenance'` to exclude it from assignment, so the two
 * screens are coupled by that shared read, not by anything in this file.
 *
 * IMPROVEMENT-PLAN PHASE 1 — one of two screens (with pointage.tsx) chosen
 * as this phase's React Query migration slice. Picked specifically because
 * it's a self-contained CRUD list (no WatermelonDB/offline-write coupling
 * the way pointage.tsx has), so it demonstrates the query+mutation+
 * invalidation pattern in its cleanest form for future screens to copy —
 * see docs/PHASE_1_BRIEF.md for why this pair and not, say, team.tsx
 * (bigger — three derived-status sections, would need SectionList rather
 * than a plain FlatList, deferred to a later phase's own pass).
 *
 * `orgId` deliberately stays a plain `useFocusEffect` + `useState` lookup,
 * NOT wrapped in `useQuery` — `getActiveOrgId()` is a local read of "which
 * org is currently active," not server data other screens display, and
 * wrapping it would need its own invalidation wired to `setActiveOrgId()`
 * (org-switcher sheet) that's out of this phase's scope. The vehicles LIST
 * itself is what moves to `useQuery`, keyed `['vehicles', orgId]` — the
 * same shared-cache-key shape §5.1 describes for `['workers', orgId]`.
 *
 * `useMutation` + `queryClient.invalidateQueries` replaces the old
 * `handleSave` → manual `await load()` — on success, every screen holding
 * `['vehicles', orgId]` (today just this one; more once other screens
 * adopt the same key) refetches automatically, no navigation event or
 * manual reload call required. `isLoading`/`isError`/`data` now map
 * directly onto Skeleton/ErrorState/content, per §5.3.
 *
 * `FlatList` replaces the previous `ScrollView` + `.map()`, per §6.1 —
 * this screen is touched this phase for the React Query work anyway, so
 * it's the natural point to also stop rendering every row regardless of
 * visibility, rather than a separate pass.
 *
 * IMPROVEMENT-PLAN PHASE 3 (§1.3 item 1) — `vehicles.photo_url` (migration
 * 0070), wired through the standard pipeline (`processPhoto` — general
 * compressed photo, NOT `processAvatarPhoto`'s square identity crop; a
 * vehicle photo is a real-world shot of the vehicle, not an avatar-shaped
 * chip) + `uploadOrgFile` + `getSignedUrl`. `photoPath` in the sheet's
 * state is the STORAGE PATH (existing on edit, or freshly uploaded on
 * save); `photoLocalUri` is only ever a local `file://` preview of a
 * newly-picked-but-not-yet-uploaded photo, shown in the sheet immediately
 * without waiting on a round trip. The list row's thumbnail uses
 * `getSignedUrlMap` (lib/storage.ts, new this phase) rather than one
 * `getSignedUrl` call per vehicle, re-minted whenever the query's data
 * changes (new fetch, or a save's invalidation refetch) — same "signed
 * URLs need re-minting per screen focus" guardrail every other photo
 * field in this app already follows.
 *
 * IMPROVEMENT-PLAN PHASE 11 (§9.1, §9.2) —
 *
 *   - Search: this screen now calls `search_all` (migration 0012) scoped
 *     to its `vehicle` branch, rather than filtering client-side the way
 *     projects.tsx/materials.tsx/expenses.tsx/journal.tsx do this same
 *     phase. JUDGMENT CALL, disclosed: `vehicles` already carries a
 *     `search_vector` column (0006) and `search_all` already has a working
 *     vehicle branch (confirmed by reading migration 0012 in full before
 *     concluding this) that's simply never been called from mobile —
 *     using the infra that's already built and paid for costs nothing
 *     extra here, unlike materials/project_expenses which have NO
 *     `search_vector` at all and would need a new migration to go this
 *     route. The four screens don't have to be identical, and aren't.
 *   - Delete: unlike journal/expenses (this same phase's lower-stakes
 *     undo-toast cases), a vehicle deletion gets the SAME weight as a
 *     worker deletion — `SwipeableRow` reveal + `ConfirmDialog` +
 *     `soft_delete_vehicle` (migration 0076), restorable via `trash.tsx`
 *     (also extended this phase). Mirrors team.tsx's own
 *     SwipeableRow+ConfirmDialog+soft_delete_worker shape exactly (read
 *     that file's pattern before writing this one, per this phase's own
 *     read-before-write instruction) — vehicles didn't have ANY delete
 *     affordance before this phase (confirmed by reading this file before
 *     concluding that, not assumed from the plan's own framing).
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

/** Per-field validation errors keyed by form field name — replaces the
 * previous single `error` string that only ever showed `issues[0]`,
 * silently hiding every other invalid field until the next submit. */
interface FieldErrors {
  name?: string;
  plate?: string;
  capacity?: string;
}

async function fetchVehicles(orgId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// Phase 11 §9.1 — search_all's `vehicle` branch (migration 0012), already
// built, never called from mobile until now. See file header for why this
// screen takes this route instead of the client-side filter the other
// three §9.1 screens use. search_all returns {entity_type, id, label,
// rank} across ALL three of its branches (projects/workers/vehicles) —
// confirmed by reading migration 0012's own return shape before writing
// this, not assumed from its name — so results are filtered to
// entity_type = 'vehicle' here and the matching ids are resolved back
// against the already-loaded `vehicles` list rather than trusting
// search_all's own bare id/label/rank shape to stand in for a full
// Vehicle row (it deliberately returns neither photo_url, status, plate
// nor capacity — a lean shape shared across three very different tables).
async function searchVehicleIds(orgId: string, query: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('search_all', {
    p_query: query,
    p_org_id: orgId,
  });
  if (error) throw error;
  return new Set(
    ((data ?? []) as { entity_type: string; id: string }[])
      .filter((row) => row.entity_type === 'vehicle')
      .map((row) => row.id),
  );
}

export default function VehiclesScreen() {
  const toast = useToast();
  const tc = useTokenColor();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgChecked, setOrgChecked] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [status, setStatus] = useState<VehicleStatus>('available');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Phase 3 §1.3 item 1 — photoPath is the storage path (existing on
  // edit, or set once a new pick finishes uploading); photoLocalUri is a
  // local file:// preview shown immediately after picking, before upload
  // completes. photoSignedUrl is only for the sheet's own preview of an
  // EXISTING photo on edit (a fresh signed URL, since the DB never stores
  // one directly — Doc 01 §1.3.11).
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoLocalUri, setPhotoLocalUri] = useState<string | null>(null);
  const [photoSignedUrl, setPhotoSignedUrl] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  // Phase 11 §9.1 — search state. `searchResultIds` is null when the
  // search box is empty (show everything); a Set once a query is active.
  const [search, setSearch] = useState('');
  const [searchResultIds, setSearchResultIds] = useState<Set<string> | null>(null);
  const [searching, setSearching] = useState(false);

  // Phase 11 §9.2 — delete state, mirroring team.tsx's own
  // deleteTarget/deleting pair exactly (see file header).
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void getActiveOrgId().then((id) => {
        setOrgId(id);
        setOrgChecked(true);
      });
    }, []),
  );

  const vehiclesQuery = useQuery({
    queryKey: ['vehicles', orgId],
    queryFn: () => fetchVehicles(orgId as string),
    enabled: !!orgId,
    // Keeps the previous list on screen while a pull-to-refresh refetch is
    // in flight, instead of the list flashing to the loading skeleton —
    // RefreshControl's own spinner already communicates "refreshing."
    placeholderData: keepPreviousData,
  });
  const vehicles = vehiclesQuery.data ?? [];

  // Phase 11 §9.1 — debounced search_all call. 300ms matches the "type,
  // pause briefly, results settle" feel of a search box without firing an
  // RPC per keystroke; cleared immediately (searchResultIds -> null) when
  // the box is emptied, so clearing search never has to wait on a network
  // round trip to show the full list again.
  useEffect(() => {
    const q = search.trim();
    if (!q || !orgId) {
      setSearchResultIds(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      void searchVehicleIds(orgId, q)
        .then(setSearchResultIds)
        .catch(() => setSearchResultIds(new Set()))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, orgId]);

  const displayedVehicles = searchResultIds
    ? vehicles.filter((v) => searchResultIds.has(v.id))
    : vehicles;

  // Phase 3 §1.3 item 1 — one signed-URL mint per distinct photo_url in
  // the current list, re-run whenever the list data changes (fetch,
  // refetch, or a save's invalidation). `getSignedUrlMap` (lib/storage.ts)
  // de-dupes and drops nulls, so a vehicle with no photo just never gets
  // an entry here — the list row already handles that with a fallback
  // icon tile.
  const [photoUrlByPath, setPhotoUrlByPath] = useState<Record<string, string>>({});
  useEffect(() => {
    void getSignedUrlMap(vehicles.map((v) => v.photo_url)).then(setPhotoUrlByPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiclesQuery.dataUpdatedAt]);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      data: CreateVehicleInput;
      status: VehicleStatus;
      photoPath: string | null;
    }) => {
      if (!orgId) throw new Error('Organisation introuvable.');
      if (editing) {
        const { error } = await supabase
          .from('vehicles')
          .update({ ...input.data, status: input.status, photo_url: input.photoPath })
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vehicles').insert({
          ...input.data,
          org_id: orgId,
          status: input.status,
          photo_url: input.photoPath,
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vehicles', orgId] });
    },
  });

  async function pickPhoto(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error(
        source === 'camera'
          ? "Autorisez l'accès à l'appareil photo pour prendre une photo."
          : "Autorisez l'accès à vos photos pour en choisir une.",
      );
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setProcessingPhoto(true);
    try {
      const processed = await processPhoto(result.assets[0].uri);
      setPhotoLocalUri(processed.uri);
    } catch {
      toast.error('Impossible de traiter la photo. Réessayez.');
    } finally {
      setProcessingPhoto(false);
    }
  }

  function openAdd() {
    setEditing(null);
    setName('');
    setPlate('');
    setCapacity('1');
    setStatus('available');
    setFieldErrors({});
    setFormError(null);
    setPhotoPath(null);
    setPhotoLocalUri(null);
    setPhotoSignedUrl(null);
    setSheetOpen(true);
  }

  function openEdit(vehicle: Vehicle) {
    setEditing(vehicle);
    setName(vehicle.name);
    setPlate(vehicle.plate ?? '');
    setCapacity(String(vehicle.capacity));
    setStatus(vehicle.status);
    setFieldErrors({});
    setFormError(null);
    setPhotoPath(vehicle.photo_url ?? null);
    setPhotoLocalUri(null);
    setPhotoSignedUrl(null);
    if (vehicle.photo_url) void getSignedUrl(vehicle.photo_url).then(setPhotoSignedUrl);
    setSheetOpen(true);
  }

  async function handleSave() {
    setFieldErrors({});
    setFormError(null);
    if (!orgId) return;

    const parsed = createVehicleSchema.safeParse({
      name,
      plate: plate || undefined,
      capacity: Number(capacity),
    });
    if (!parsed.success) {
      // Phase 25 — map every failing field to its own FormField/PlateInput
      // `error` prop, not just `issues[0]` at the bottom of the sheet, so a
      // form with 2+ invalid fields shows both at once instead of only the
      // first one until the next submit attempt.
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'name' || key === 'plate' || key === 'capacity') {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      haptics.error();
      return;
    }

    const wasMaintenance = editing?.status === 'maintenance';

    try {
      // A freshly-picked-but-not-yet-uploaded photo (photoLocalUri) is
      // only uploaded now, at save time — not immediately on pick — so a
      // cancelled sheet never leaves an orphaned file in Storage.
      let finalPhotoPath = photoPath;
      if (photoLocalUri && orgId) {
        finalPhotoPath = await uploadOrgFile(orgId, 'vehicles', photoLocalUri, 'jpg', 'image/jpeg');
      }

      await saveMutation.mutateAsync({ data: parsed.data, status, photoPath: finalPhotoPath });

      // Doc 02 §2.2 — marking "Maintenance" removes it from dispatch's
      // assignable list; surface that consequence here rather than
      // silently, since the contractor is acting from this screen, not
      // the dispatch board, and might not otherwise notice the effect.
      // Phase 25 — this is advisory info, not a decision the contractor
      // needs to confirm before proceeding (the update already
      // happened), so it's a longer-lived info toast rather than a
      // blocking Alert/ConfirmDialog.
      if (editing && status === 'maintenance' && !wasMaintenance) {
        const { count } = await supabase
          .from('dispatch_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('vehicle_id', editing.id)
          .gte('assignment_date', new Date().toISOString().slice(0, 10));
        if (count && count > 0) {
          toast.info(
            `Attention : ce véhicule a ${count} affectation(s) à venir. Vérifiez le tableau de dispatch.`,
          );
        }
      }
      toast.success(editing ? 'Véhicule mis à jour.' : 'Véhicule ajouté.');
      haptics.confirm();
      setSheetOpen(false);
    } catch (e: any) {
      setFormError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error: rpcError } = await supabase.rpc('soft_delete_vehicle', {
      p_vehicle_id: deleteTarget.id,
    });
    setDeleting(false);
    if (rpcError) {
      toast.error('Impossible de supprimer ce véhicule.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Véhicule déplacé vers la corbeille.');
    setDeleteTarget(null);
    await queryClient.invalidateQueries({ queryKey: ['vehicles', orgId] });
  }

  if (!orgChecked || (vehiclesQuery.isLoading && !vehiclesQuery.isPlaceholderData)) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (vehiclesQuery.isError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState
          illustration="warning"
          title="Impossible de charger les véhicules"
          description="Vérifiez votre connexion et réessayez."
          onRetry={() => void vehiclesQuery.refetch()}
        />
      </YStack>
    );
  }

  if (vehicles.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={CarIcon}
          illustration="destination"
          title="Aucun véhicule"
          description="Ajoutez votre premier véhicule pour commencer à planifier vos dispatchs. Utilisez le bouton + ci-dessous."
        />
        <FAB icon={PlusIcon} accessibilityLabel="Ajouter un véhicule" onPress={openAdd} />
        {renderSheet()}
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <FlatList
        data={displayedVehicles}
        keyExtractor={(vehicle) => vehicle.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={vehiclesQuery.isRefetching}
            onRefresh={() => void vehiclesQuery.refetch()}
            tintColor={color.accent[600]}
          />
        }
        ListHeaderComponent={
          <YStack marginBottom="$4" gap="$3">
            <XStack alignItems="center" gap="$2">
              <Icon3D name="pickup-truck" size={40} />
              <Text fontFamily="$display" fontSize={23} fontWeight="600">
                Véhicules
              </Text>
            </XStack>
            {/* Phase 11 §9.1 — search_all-backed search bar. See file
                header for why this screen calls the RPC instead of
                filtering client-side. UI/UX pass: now on SearchFilterBar
                for the same fixed-height treatment as Chantiers/
                Matériaux. */}
            <SearchFilterBar
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un véhicule ou une plaque"
            />
          </YStack>
        }
        ListEmptyComponent={
          searching ? null : (
            <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
              Aucun véhicule ne correspond à cette recherche.
            </Text>
          )
        }
        ItemSeparatorComponent={() => <YStack height={8} />}
        renderItem={({ item: vehicle }) => (
          <SwipeableRow
            rightAction={{
              label: 'Supprimer',
              color: color.status.danger,
              icon: TrashIcon,
              onPress: () => setDeleteTarget(vehicle),
            }}
          >
            {/* UI/UX pass — composes the shared `ListCard`. The leading
                slot takes either the vehicle's photo or, absent one, an
                icon chip (CarIcon, tinted categoricalBlue) rather than
                the previous plain gray box — keeps a visual identity
                even with no photo uploaded, consistent with Chantiers'
                icon-chip pattern. Plate + capacity become a real
                metadata row with icons instead of a single `·`-joined
                text line. */}
            <ListCard
              leading={
                vehicle.photo_url && photoUrlByPath[vehicle.photo_url] ? (
                  <Image
                    src={photoUrlByPath[vehicle.photo_url]}
                    width={44}
                    height={44}
                    borderRadius={11}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    width={44}
                    height={44}
                    borderRadius={11}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={toRgba(tc.categoricalBlue, 0.14)}
                  >
                    <CarIcon size={20} weight="fill" color={tc.categoricalBlue} />
                  </View>
                )
              }
              title={vehicle.name}
              onPress={() => openEdit(vehicle)}
              metaItems={[
                { icon: IdentificationCardIcon, label: vehicle.plate ?? '—' },
                { icon: UsersIcon, label: `${vehicle.capacity} place(s)` },
              ]}
              badge={
                <StatusBadge variant={STATUS_BADGE[vehicle.status].variant}>
                  {STATUS_BADGE[vehicle.status].label}
                </StatusBadge>
              }
            />
          </SwipeableRow>
        )}
      />

      <FAB icon={PlusIcon} accessibilityLabel="Ajouter un véhicule" onPress={openAdd} />
      {renderSheet()}
      {renderDeleteConfirm()}
    </YStack>
  );

  function renderDeleteConfirm() {
    return (
      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Supprimer ce véhicule ?"
        description={
          deleteTarget
            ? `${deleteTarget.name} sera déplacé vers la corbeille et restaurable pendant 30 jours.`
            : undefined
        }
        confirmLabel="Supprimer"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    );
  }

  function renderSheet() {
    return (
      <Sheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? 'Modifier le véhicule' : 'Ajouter un véhicule'}
      >
        <YStack gap="$3">
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="500">
              Photo
            </Text>
            {photoLocalUri || photoSignedUrl ? (
              <XStack alignItems="center" gap="$3">
                <Image
                  source={{ uri: photoLocalUri ?? photoSignedUrl ?? undefined }}
                  width={72}
                  height={72}
                  borderRadius={12}
                  resizeMode="cover"
                />
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => {
                    setPhotoPath(null);
                    setPhotoLocalUri(null);
                    setPhotoSignedUrl(null);
                  }}
                >
                  Retirer
                </Button>
              </XStack>
            ) : (
              <XStack gap="$2">
                <Button
                  variant="secondary"
                  shareRow
                  icon={CameraIcon}
                  loading={processingPhoto}
                  onPress={() => void pickPhoto('camera')}
                >
                  Appareil photo
                </Button>
                <Button
                  variant="secondary"
                  shareRow
                  icon={ImageIcon}
                  loading={processingPhoto}
                  onPress={() => void pickPhoto('library')}
                >
                  Galerie
                </Button>
              </XStack>
            )}
          </YStack>

          <FormField
            label="Nom"
            value={name}
            onChangeText={setName}
            placeholder="Ex: Camionnette 1"
            error={fieldErrors.name}
          />
          {/* Phase 26 — Tunisia-specific plate entry (two numeric groups +
              fixed "TUN" chip) replacing the previous free-text field. */}
          <PlateInput value={plate} onChangeText={setPlate} error={fieldErrors.plate} />
          <FormField
            label="Capacité"
            value={capacity}
            onChangeText={setCapacity}
            keyboardType="numeric"
            error={fieldErrors.capacity}
          />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Statut
            </Text>
            <SegmentedControl value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          </YStack>

          {formError && <Text color="$danger">{formError}</Text>}

          <Button onPress={handleSave} loading={saveMutation.isPending}>
            {editing ? 'Enregistrer' : 'Ajouter'}
          </Button>

          {/* Phase 8 (§1.3 steps 2-3) — maintenance log + document expiry
              live on a new vehicle/[id].tsx detail screen, not crammed
              into this edit sheet's own fields. Decided by mirroring
              worker/[id].tsx's tabbed-hub pattern (WorkerHubTabs.tsx is
              generic enough to reuse as-is) rather than restructuring
              this screen's existing tap-to-edit-sheet interaction model —
              only reachable for a vehicle that already exists, since a
              maintenance history/document record needs a vehicle_id that
              doesn't exist yet during "Ajouter un véhicule". */}
          {editing && (
            <Button
              variant="secondary"
              icon={WrenchIcon}
              onPress={() => {
                setSheetOpen(false);
                router.push(`/vehicle/${editing.id}` as never);
              }}
            >
              Maintenance et documents
            </Button>
          )}
        </YStack>
      </Sheet>
    );
  }
}
