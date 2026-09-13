import { color } from '@dala/design-tokens';
import type { OrgInsurance, SafetyIncident, Worker } from '@dala/shared-types';
import { createOrgInsuranceSchema, createSafetyIncidentSchema } from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from 'expo-router';
import {
  BuildingsIcon,
  CameraIcon,
  CalendarBlankIcon,
  FilePdfIcon,
  MapPinIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShieldWarningIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Image, Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { ListCard } from '@/components/ui/ListCard';
import { NumericText } from '@/components/ui/NumericText';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { useFabBottomContentInset } from '@/lib/fabLayout';
import { haptics } from '@/lib/haptics';
import { processPhoto } from '@/lib/photoPipeline';
import { INCIDENT_TYPE_OPTIONS, INSURANCE_COVERAGE_OPTIONS } from '@/lib/pickerOptions';
import { getSignedUrl, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/safety.tsx
 *
 * Doc 03 §3.17 — two tabs sharing one route (the stub this replaces was a
 * single file, and PlusSheet only has one "Sécurité" entry — splitting
 * this into two separate routes would mean touching shared nav wiring for
 * no real benefit):
 *   - Safety incidents: list/detail, date/location/description/photos/
 *     severity/involved-worker multi-select, PDF export.
 *   - Insurance tracker: list/detail, policy number/provider/coverage
 *     type/expiry date/auto-reminder toggle (on by default).
 *
 * Org-wide, not per-project, for both tabs — same reasoning as
 * materials.tsx: §3.17 doesn't describe project-scoped lists the way
 * Journal/Expenses do.
 *
 * ** Scope cut, stated plainly rather than silently dropped **: "PDF
 * export" (incidents) is a button that shows "Bientôt disponible" instead
 * of producing a real PDF. Doc 01 §1.6 lists Edge Functions generically
 * for "report generation" but there is no incident-report generation
 * function anywhere in supabase/functions today, and building one from
 * scratch (template, layout, storage of the generated file) is a
 * meaningfully bigger unit of work than a mobile screen — same category
 * of cut as expenses.tsx's "standalone screen instead of full Projects
 * CRUD," called out instead of glossed over.
 *
 * Insurance's `document_url` (policy PDF/scan) is NOT wired to an upload
 * picker here — expo-document-picker isn't a dependency anywhere in this
 * repo, and adding a third guessed-version package in one pass (on top of
 * expo-audio/expo-location, see package.json) felt like it was stretching
 * "flag rather than guess" past its usefulness. The insurance form below
 * captures every other field; document upload is left as a clearly-marked
 * follow-up rather than either silently working around it with the
 * (image-only) photo picker or skipping the whole insurance tracker.
 */
type Tab = 'incidents' | 'insurance';
type SeverityValue = 'minor' | 'moderate' | 'severe';

const SEVERITY_OPTIONS: { value: SeverityValue; label: string; color: string }[] = [
  { value: 'minor', label: 'Mineur', color: '$success' },
  { value: 'moderate', label: 'Modéré', color: '$warning' },
  { value: 'severe', label: 'Grave', color: '$danger' },
];
const SEVERITY_BADGE: Record<SeverityValue, 'success' | 'warning' | 'danger'> = {
  minor: 'success',
  moderate: 'warning',
  severe: 'danger',
};
const SEVERITY_LABEL: Record<SeverityValue, string> = {
  minor: 'Mineur',
  moderate: 'Modéré',
  severe: 'Grave',
};

const REMINDER_OPTIONS = [
  { value: 'on' as const, label: 'Activé', color: '$success' },
  { value: 'off' as const, label: 'Désactivé', color: '$neutral500' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function SafetyScreen() {
  const toast = useToast();
  const tc = useTokenColor();
  const [tab, setTab] = useState<Tab>('incidents');
  const [loading, setLoading] = useState(true);
  const fabBottomInset = useFabBottomContentInset();
  // Phase 20 (§1.7a) — the three parallel root queries below had no
  // error capture; a failed fetch previously rendered as "Aucun
  // incident"/empty insurance list on both tabs, indistinguishable from
  // genuinely having neither.
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [incidentWorkerIds, setIncidentWorkerIds] = useState<Record<string, string[]>>({});
  const [insurances, setInsurances] = useState<OrgInsurance[]>([]);

  // Incident create sheet
  const [incidentSheetOpen, setIncidentSheetOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SeverityValue>('minor');
  // IMPROVEMENT-PLAN PHASE 4 (§3) — new field, migration 0071. Defaults to
  // the list's first option (same pattern `severity` already uses,
  // defaulting to 'minor') rather than starting unset — every new incident
  // should carry a category, per the plan's own "closed list... required"
  // framing for chartability.
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPE_OPTIONS[0]!.value);
  const [location, setLocation] = useState('');
  const [involvedWorkerIds, setInvolvedWorkerIds] = useState<string[]>([]);
  const [incidentPhotoUri, setIncidentPhotoUri] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  // Insurance create/edit sheet
  const [insuranceSheetOpen, setInsuranceSheetOpen] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [coverageType, setCoverageType] = useState('');
  const [expiresAt, setExpiresAt] = useState(todayISO());
  const [reminderEnabled, setReminderEnabled] = useState<'on' | 'off'>('on');

  const [detailIncidentId, setDetailIncidentId] = useState<string | null>(null);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [
      { data: workerRows, error: workersError },
      { data: incidentRows, error: incidentsError },
      { data: insuranceRows, error: insuranceError },
    ] = await Promise.all([
      supabase.from('workers').select('*').eq('org_id', org).order('full_name'),
      supabase
        .from('safety_incidents')
        .select('*')
        .eq('org_id', org)
        .order('created_at', { ascending: false }),
      supabase.from('org_insurances').select('*').eq('org_id', org).order('expires_at'),
    ]);
    if (workersError || incidentsError || insuranceError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setWorkers((workerRows as Worker[] | null) ?? []);
    const incidentList = (incidentRows as SafetyIncident[] | null) ?? [];
    setIncidents(incidentList);
    setInsurances((insuranceRows as OrgInsurance[] | null) ?? []);

    if (incidentList.length > 0) {
      const { data: links } = await supabase
        .from('safety_incident_workers')
        .select('incident_id, worker_id')
        .in(
          'incident_id',
          incidentList.map((i) => i.id),
        );
      const map: Record<string, string[]> = {};
      (links ?? []).forEach((l: any) => {
        map[l.incident_id] = [...(map[l.incident_id] ?? []), l.worker_id];
      });
      setIncidentWorkerIds(map);
    }
    setLoading(false);
    setRefreshing(false);
  }

  const workerById = useMemo(() => {
    const map: Record<string, Worker> = {};
    workers.forEach((w) => (map[w.id] = w));
    return map;
  }, [workers]);

  function openIncidentSheet() {
    setDescription('');
    setSeverity('minor');
    setIncidentType(INCIDENT_TYPE_OPTIONS[0]!.value);
    setLocation('');
    setInvolvedWorkerIds([]);
    setIncidentPhotoUri(null);
    setError(null);
    setIncidentSheetOpen(true);
  }

  async function pickIncidentPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Autorisez l'accès à l'appareil photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setProcessingPhoto(true);
    try {
      const processed = await processPhoto(result.assets[0].uri);
      setIncidentPhotoUri(processed.uri);
    } finally {
      setProcessingPhoto(false);
    }
  }

  function toggleInvolvedWorker(workerId: string) {
    setInvolvedWorkerIds((current) =>
      current.includes(workerId) ? current.filter((id) => id !== workerId) : [...current, workerId],
    );
  }

  async function handleSaveIncident() {
    setError(null);
    if (!orgId) return;

    const parsed = createSafetyIncidentSchema.safeParse({
      description,
      severity,
      incident_type: incidentType,
      location: location || undefined,
      involved_worker_ids: involvedWorkerIds.length > 0 ? involvedWorkerIds : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les champs.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      let photoPath: string | null = null;
      if (incidentPhotoUri) {
        photoPath = await uploadOrgFile(orgId, 'safety', incidentPhotoUri, 'jpg', 'image/jpeg');
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data: inserted, error: insertError } = await supabase
        .from('safety_incidents')
        .insert({
          org_id: orgId,
          description: parsed.data.description,
          severity: parsed.data.severity,
          incident_type: parsed.data.incident_type,
          location: parsed.data.location ?? null,
          photo_url: photoPath,
          reported_by: session?.user.id ?? null,
        })
        .select()
        .single();
      if (insertError) throw insertError;

      if (parsed.data.involved_worker_ids && inserted) {
        await supabase.from('safety_incident_workers').insert(
          parsed.data.involved_worker_ids.map((worker_id) => ({
            incident_id: inserted.id,
            worker_id,
          })),
        );
      }

      haptics.confirm();
      toast.success('Incident enregistré.');
      setIncidentSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  function openInsuranceSheet() {
    setProviderName('');
    setPolicyNumber('');
    setCoverageType('');
    setExpiresAt(todayISO());
    setReminderEnabled('on');
    setError(null);
    setInsuranceSheetOpen(true);
  }

  async function handleSaveInsurance() {
    setError(null);
    if (!orgId) return;

    const parsed = createOrgInsuranceSchema.safeParse({
      provider_name: providerName,
      policy_number: policyNumber || undefined,
      coverage_type: coverageType || undefined,
      expires_at: expiresAt,
      reminder_enabled: reminderEnabled === 'on',
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Vérifiez les champs.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase.from('org_insurances').insert({
        org_id: orgId,
        provider_name: parsed.data.provider_name,
        policy_number: parsed.data.policy_number ?? null,
        coverage_type: parsed.data.coverage_type ?? null,
        expires_at: parsed.data.expires_at,
        reminder_enabled: parsed.data.reminder_enabled,
      });
      if (insertError) throw insertError;

      haptics.confirm();
      toast.success('Assurance ajoutée.');
      setInsuranceSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Une erreur est survenue.');
    } finally {
      setSaving(false);
    }
  }

  async function openIncidentDetail(incident: SafetyIncident) {
    setDetailIncidentId(incident.id);
    setDetailPhotoUrl(incident.photo_url ? await getSignedUrl(incident.photo_url) : null);
  }

  function handleExportPdf() {
    toast.info("L'export PDF des incidents arrive prochainement.");
  }

  const detailIncident = useMemo(
    () => incidents.find((i) => i.id === detailIncidentId) ?? null,
    [incidents, detailIncidentId],
  );

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: fabBottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <XStack alignItems="center" gap="$2" marginBottom="$4">
          <Icon3D name="safety-vest" size={40} />
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Sécurité & assurance
          </Text>
        </XStack>

        <YStack marginBottom="$4">
          <SegmentedControl
            value={tab}
            options={[
              { value: 'incidents', label: 'Incidents', color: '$neutral900' },
              { value: 'insurance', label: 'Assurances', color: '$neutral900' },
            ]}
            onChange={setTab}
          />
        </YStack>

        {tab === 'incidents' ? (
          incidents.length === 0 ? (
            <EmptyState
              icon={ShieldWarningIcon}
              illustration="warning"
              title="Aucun incident"
              description="Les incidents de sécurité signalés apparaîtront ici."
            />
          ) : (
            <YStack gap="$2">
              {/* UI/UX pass — composes the shared `ListCard`. Icon chip
                  tinted by severity (reusing the existing status colors,
                  not a new hue) so severity is visible before reading
                  the badge text — same "status legible from card shape"
                  principle as the Avances rework. */}
              {incidents.map((incident) => {
                const sev = incident.severity as SeverityValue;
                const sevTint =
                  sev === 'severe' ? tc.danger : sev === 'moderate' ? tc.warning : tc.success;
                return (
                  <ListCard
                    key={incident.id}
                    icon={ShieldWarningIcon}
                    iconTint={sevTint}
                    title={incident.incident_type || 'Incident'}
                    subtitle={incident.description}
                    metaItems={[
                      {
                        icon: CalendarBlankIcon,
                        label: new Date(incident.created_at).toLocaleDateString('fr-TN'),
                      },
                      ...(incident.location
                        ? [{ icon: MapPinIcon, label: incident.location }]
                        : []),
                    ]}
                    onPress={() => openIncidentDetail(incident)}
                    badge={
                      <StatusBadge variant={SEVERITY_BADGE[sev]}>{SEVERITY_LABEL[sev]}</StatusBadge>
                    }
                  />
                );
              })}
            </YStack>
          )
        ) : insurances.length === 0 ? (
          <EmptyState
            icon={ShieldWarningIcon}
            illustration="property-agreement"
            title="Aucune assurance"
            description="Ajoutez les polices d'assurance de votre organisation."
          />
        ) : (
          <YStack gap="$2">
            {/* UI/UX pass — composes the shared `ListCard`, same
                treatment as the incidents tab above: a policy icon chip
                (categoricalBlue — insurance isn't a status/severity
                concept, so it doesn't borrow a status color) instead of
                a plain text-only card. */}
            {insurances.map((insurance) => {
              const expiringSoon =
                insurance.expires_at &&
                new Date(insurance.expires_at).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
              return (
                <ListCard
                  key={insurance.id}
                  icon={ShieldCheckIcon}
                  iconTint={tc.categoricalBlue}
                  title={insurance.provider_name}
                  subtitle={insurance.coverage_type ?? undefined}
                  badge={
                    expiringSoon && <StatusBadge variant="warning">Expire bientôt</StatusBadge>
                  }
                >
                  {insurance.expires_at && (
                    <NumericText fontSize={13} color="$neutral500">
                      Expire le {new Date(insurance.expires_at).toLocaleDateString('fr-TN')}
                    </NumericText>
                  )}
                </ListCard>
              );
            })}
          </YStack>
        )}
      </ScrollView>

      <FAB
        icon={PlusIcon}
        onPress={tab === 'incidents' ? openIncidentSheet : openInsuranceSheet}
        accessibilityLabel={tab === 'incidents' ? 'Nouvel incident' : 'Nouvelle assurance'}
      />

      <Sheet
        visible={incidentSheetOpen}
        onClose={() => setIncidentSheetOpen(false)}
        title="Nouvel incident"
      >
        <YStack gap="$3">
          {/* IMPROVEMENT-PLAN PHASE 4 (§3) — new field (migration 0071);
              placed first so the contractor classifies the incident type
              before writing the free-text description, keeping the closed
              list's value (chartability by category, §2.3) intact even
              when descriptions later vary between incidents. */}
          <Select
            label="Type d'incident"
            value={incidentType}
            onChange={setIncidentType}
            options={INCIDENT_TYPE_OPTIONS}
            otherLabel="Autre — préciser"
          />
          <FormField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Gravité
            </Text>
            <SegmentedControl value={severity} options={SEVERITY_OPTIONS} onChange={setSeverity} />
          </YStack>
          <FormField
            label="Lieu (optionnel)"
            icon={MapPinIcon}
            value={location}
            onChangeText={setLocation}
          />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Photo
            </Text>
            <Button
              variant="secondary"
              icon={CameraIcon}
              loading={processingPhoto}
              onPress={pickIncidentPhoto}
            >
              {incidentPhotoUri ? 'Reprendre la photo' : 'Prendre une photo'}
            </Button>
          </YStack>

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Travailleurs impliqués
            </Text>
            <YStack gap="$1">
              {workers.map((w) => {
                const active = involvedWorkerIds.includes(w.id);
                return (
                  <XStack
                    key={w.id}
                    alignItems="center"
                    gap="$3"
                    paddingVertical={8}
                    paddingHorizontal={8}
                    borderRadius="$control"
                    backgroundColor={active ? '$accent100' : 'transparent'}
                    onPress={() => toggleInvolvedWorker(w.id)}
                  >
                    <Avatar name={w.full_name} size={26} />
                    <Text fontSize={14.5}>{w.full_name}</Text>
                  </XStack>
                );
              })}
            </YStack>
          </YStack>

          {error && <Text color="$danger">{error}</Text>}
          <Button onPress={handleSaveIncident} loading={saving}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>

      <Sheet
        visible={insuranceSheetOpen}
        onClose={() => setInsuranceSheetOpen(false)}
        title="Nouvelle assurance"
      >
        <YStack gap="$3">
          <FormField
            label="Fournisseur"
            icon={BuildingsIcon}
            value={providerName}
            onChangeText={setProviderName}
          />
          <FormField
            label="Numéro de police (optionnel)"
            value={policyNumber}
            onChangeText={setPolicyNumber}
          />
          {/* IMPROVEMENT-PLAN PHASE 4 (§3) — coverage_type was a
              free FormField; now a Select with the closed list from
              §3's table. Optional (nothing is pre-selected when the
              sheet opens); leaving it empty is allowed by the schema. */}
          <Select
            label="Type de couverture (optionnel)"
            icon={ShieldCheckIcon}
            value={coverageType || null}
            onChange={setCoverageType}
            options={INSURANCE_COVERAGE_OPTIONS}
          />
          <FormField
            label="Date d'expiration (AAAA-MM-JJ)"
            icon={CalendarBlankIcon}
            value={expiresAt}
            onChangeText={setExpiresAt}
          />
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Rappel 30 jours avant expiration
            </Text>
            <SegmentedControl
              value={reminderEnabled}
              options={REMINDER_OPTIONS}
              onChange={setReminderEnabled}
            />
          </YStack>
          {error && <Text color="$danger">{error}</Text>}
          <Button onPress={handleSaveInsurance} loading={saving}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>

      <Sheet
        visible={Boolean(detailIncident)}
        onClose={() => setDetailIncidentId(null)}
        title="Incident"
      >
        {detailIncident && (
          <YStack gap="$3">
            {detailPhotoUrl && (
              <Image
                source={{ uri: detailPhotoUrl }}
                width="100%"
                height={200}
                borderRadius={16}
                resizeMode="cover"
              />
            )}
            <Text fontSize={14.5}>{detailIncident.description}</Text>
            <XStack gap="$4" flexWrap="wrap">
              {/* Phase 4 §3 — incident_type shown first; nullable only for
                  pre-migration rows (new rows always carry it). */}
              {detailIncident.incident_type && (
                <YStack>
                  <Text fontSize={13} color="$neutral500">
                    Type
                  </Text>
                  <Text fontSize={14.5}>{detailIncident.incident_type}</Text>
                </YStack>
              )}
              <YStack>
                <Text fontSize={13} color="$neutral500">
                  Gravité
                </Text>
                <StatusBadge variant={SEVERITY_BADGE[detailIncident.severity as SeverityValue]}>
                  {SEVERITY_LABEL[detailIncident.severity as SeverityValue]}
                </StatusBadge>
              </YStack>
              {detailIncident.location && (
                <YStack>
                  <Text fontSize={13} color="$neutral500">
                    Lieu
                  </Text>
                  <Text fontSize={14.5}>{detailIncident.location}</Text>
                </YStack>
              )}
            </XStack>
            {(incidentWorkerIds[detailIncident.id] ?? []).length > 0 && (
              <YStack gap="$1">
                <Text fontSize={13} color="$neutral500">
                  Travailleurs impliqués
                </Text>
                <XStack flexWrap="wrap" gap="$2">
                  {(incidentWorkerIds[detailIncident.id] ?? []).map((id) => (
                    <XStack key={id} alignItems="center" gap="$1.5">
                      <Avatar name={workerById[id]?.full_name ?? '?'} size={22} />
                      <Text fontSize={13.5}>{workerById[id]?.full_name ?? '—'}</Text>
                    </XStack>
                  ))}
                </XStack>
              </YStack>
            )}
            <Text fontSize={13} color="$neutral500">
              {new Date(detailIncident.created_at).toLocaleString('fr-TN')}
            </Text>
            <Button variant="secondary" icon={FilePdfIcon} onPress={handleExportPdf}>
              Exporter en PDF
            </Button>
          </YStack>
        )}
      </Sheet>
    </YStack>
  );
}
