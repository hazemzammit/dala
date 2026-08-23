import { color } from '@dala/design-tokens';
import type { Vehicle, VehicleDocument, VehicleMaintenanceLogEntry } from '@dala/shared-types';
import { createVehicleDocumentSchema, createVehicleMaintenanceLogSchema } from '@dala/validation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, CarIcon, PlusIcon, WrenchIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { NumericText } from '@/components/ui/NumericText';
import { ProgressBar } from '@/components/ui/Progress';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { WorkerHubTabs } from '@/components/worker/WorkerHubTabs';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { VEHICLE_DOCUMENT_TYPE_OPTIONS } from '@/lib/pickerOptions';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/vehicle/[id].tsx
 *
 * NEW in Phase 8 (improvement-plan §1.3 steps 2-3). Second dynamic route
 * in this app after worker/[id].tsx (Phase 5's own header calls itself
 * "the first dynamic route… the precedent for any future detail screen" —
 * this is that future screen). Deliberately mirrors that file's shape:
 * `WorkerHubTabs` (already generic — takes any `{value,label}[]`, despite
 * its worker-specific name, confirmed by reading it before reusing it
 * here) as the tab switcher, same header layout
 * (back-arrow + title, paddingTop=56), same `useFocusEffect`-resets-tab
 * convention. Two tabs only (Maintenance/Documents) — there's no "Infos"
 * tab here because vehicles.tsx's own edit sheet already owns the basic
 * fields (name/plate/capacity/status/photo); this screen is scoped to
 * exactly the two new things §1.3 steps 2-3 ask for, reached from that
 * sheet's new "Maintenance et documents" button (see vehicles.tsx).
 *
 * Both `vehicle_maintenance_log` and `vehicle_documents` (migration 0073)
 * are append-only — see that migration's own Part 3 header for the full
 * reasoning, including why vehicle_documents is modeled this way instead
 * of as a mutable per-document-type row. That means BOTH tabs here are
 * add-only lists (a FAB + create sheet each), never edit/delete — there
 * is no "edit this maintenance entry" or "edit this document" anywhere in
 * this file, by design, not an oversight.
 *
 * Documents tab resolves "current" per document_type as the most recent
 * row (DISTINCT ON via a client-side reduce, since Supabase-js has no
 * direct DISTINCT ON helper) and shows a due-soon badge + a ProgressBar
 * reusing the exact threshold semantics `expenses.tsx`/`projects.tsx`
 * already use for "budget consommé" (green <80%, amber 80-100%, red
 * >100%) — see `expiryProgressPercent()` below for how a days-until-
 * expiry value is mapped onto that same 0-100(+)% scale within a 30-day
 * due-soon window. This mapping is this file's own judgment call, not
 * specified anywhere in the plan text beyond "reusing the ProgressBar/
 * budget-consommé visual pattern."
 */

const DUE_SOON_WINDOW_DAYS = 30;

/** Maps "days until expiry" onto the same 0-100(+)% scale ProgressBar's
 * existing green/amber/red thresholds already use elsewhere in this app —
 * 0% at 30+ days out, 80% (amber) at 6 days out, 100%+ (red) at/after
 * expiry. See file header for why this mapping, not a literal spec. */
function expiryProgressPercent(expiresAt: string): number {
  const daysRemaining = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0, ((DUE_SOON_WINDOW_DAYS - daysRemaining) / DUE_SOON_WINDOW_DAYS) * 100);
}

function daysRemainingLabel(expiresAt: string): {
  label: string;
  variant: 'success' | 'warning' | 'danger';
} {
  const daysRemaining = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (daysRemaining < 0) return { label: 'Expiré', variant: 'danger' };
  if (daysRemaining <= DUE_SOON_WINDOW_DAYS)
    return { label: `Expire dans ${daysRemaining} j`, variant: 'warning' };
  return { label: 'Valide', variant: 'success' };
}

export default function VehicleDetailScreen() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'maintenance' | 'documents'>('maintenance');

  const [maintenanceLog, setMaintenanceLog] = useState<VehicleMaintenanceLogEntry[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);

  const [maintenanceSheetOpen, setMaintenanceSheetOpen] = useState(false);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [logDescription, setLogDescription] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logError, setLogError] = useState<string | null>(null);
  const [savingLog, setSavingLog] = useState(false);

  const [documentSheetOpen, setDocumentSheetOpen] = useState(false);
  const [documentType, setDocumentType] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [savingDocument, setSavingDocument] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setActiveTab('maintenance');
      void load();
    }, [id]),
  );

  async function load() {
    if (!id) return;
    setLoading(true);
    const org = await getActiveOrgId();
    setOrgId(org);
    if (!org) {
      setVehicle(null);
      setMaintenanceLog([]);
      setDocuments([]);
      setLoading(false);
      return;
    }

    const [{ data: vehicleRow }, { data: logRows }, { data: documentRows }] = await Promise.all([
      supabase.from('vehicles').select('*').eq('id', id).eq('org_id', org).maybeSingle(),
      supabase
        .from('vehicle_maintenance_log')
        .select('*')
        .eq('vehicle_id', id)
        .order('log_date', { ascending: false }),
      supabase
        .from('vehicle_documents')
        .select('*')
        .eq('vehicle_id', id)
        .order('created_at', { ascending: false }),
    ]);

    setVehicle((vehicleRow as Vehicle | null) ?? null);
    setMaintenanceLog((logRows as VehicleMaintenanceLogEntry[] | null) ?? []);
    setDocuments((documentRows as VehicleDocument[] | null) ?? []);
    setLoading(false);
  }

  /** Resolves "current" per document_type as the most recent row — this
   * table is append-only (migration 0073), so the full row list can
   * contain several renewals of the same document_type; only the latest
   * is shown as this vehicle's current standing for that type. */
  const currentDocuments = useMemo(() => {
    const byType = new Map<string, VehicleDocument>();
    for (const doc of documents) {
      if (!byType.has(doc.document_type)) byType.set(doc.document_type, doc);
    }
    return Array.from(byType.values());
  }, [documents]);

  function openMaintenanceSheet() {
    setLogDate(new Date().toISOString().slice(0, 10));
    setLogDescription('');
    setLogCost('');
    setLogError(null);
    setMaintenanceSheetOpen(true);
  }

  async function handleSaveMaintenanceLog() {
    if (!orgId || !id) return;
    setLogError(null);
    const parsed = createVehicleMaintenanceLogSchema.safeParse({
      vehicle_id: id,
      log_date: logDate ?? undefined,
      description: logDescription,
      cost: logCost.trim() ? Number(logCost) : undefined,
    });
    if (!parsed.success) {
      setLogError(parsed.error.issues[0]?.message ?? 'Vérifiez les champs du formulaire.');
      haptics.error();
      return;
    }

    setSavingLog(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.from('vehicle_maintenance_log').insert({
        org_id: orgId,
        vehicle_id: parsed.data.vehicle_id,
        log_date: parsed.data.log_date,
        description: parsed.data.description,
        cost: parsed.data.cost ?? null,
        logged_by: session?.user.id ?? null,
      });
      if (error) throw error;
      haptics.confirm();
      toast.success('Entrée ajoutée.');
      setMaintenanceSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      setLogError(e?.message ?? "Impossible d'ajouter cette entrée.");
    } finally {
      setSavingLog(false);
    }
  }

  function openDocumentSheet() {
    setDocumentType('');
    setExpiresAt(null);
    setDocumentError(null);
    setDocumentSheetOpen(true);
  }

  async function handleSaveDocument() {
    if (!orgId || !id) return;
    setDocumentError(null);
    const parsed = createVehicleDocumentSchema.safeParse({
      vehicle_id: id,
      document_type: documentType,
      expires_at: expiresAt ?? undefined,
    });
    if (!parsed.success) {
      setDocumentError(parsed.error.issues[0]?.message ?? 'Vérifiez les champs du formulaire.');
      haptics.error();
      return;
    }

    setSavingDocument(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.from('vehicle_documents').insert({
        org_id: orgId,
        vehicle_id: parsed.data.vehicle_id,
        document_type: parsed.data.document_type,
        expires_at: parsed.data.expires_at,
        recorded_by: session?.user.id ?? null,
      });
      if (error) throw error;
      haptics.confirm();
      toast.success('Document enregistré.');
      setDocumentSheetOpen(false);
      await load();
    } catch (e: any) {
      haptics.error();
      setDocumentError(e?.message ?? "Impossible d'enregistrer ce document.");
    } finally {
      setSavingDocument(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingTop={56}>
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (!vehicle) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" alignItems="center" justifyContent="center">
        <Text color="$neutral500">Véhicule introuvable.</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack
        alignItems="center"
        gap="$3"
        paddingTop={56}
        paddingHorizontal="$4"
        paddingBottom="$3"
      >
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={22} color={color.neutral[900]} />
        </XStack>
        <YStack flex={1}>
          <Text fontFamily="$display" fontSize={18} fontWeight="600">
            {vehicle.name}
          </Text>
          <Text fontSize={12.5} color="$neutral500">
            {vehicle.plate ?? 'Sans plaque'}
          </Text>
        </YStack>
      </XStack>

      <YStack paddingHorizontal="$4" paddingBottom="$3">
        <WorkerHubTabs
          value={activeTab}
          onChange={(v) => setActiveTab(v as typeof activeTab)}
          tabs={[
            { value: 'maintenance', label: 'Maintenance' },
            { value: 'documents', label: 'Documents' },
          ]}
        />
      </YStack>

      {activeTab === 'maintenance' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 100 }}>
          {maintenanceLog.length === 0 ? (
            <EmptyState
              icon={WrenchIcon}
              title="Aucun entretien enregistré"
              description="Ajoutez la première entrée de l'historique de maintenance de ce véhicule."
            />
          ) : (
            <YStack backgroundColor="$neutral0" borderRadius="$card" overflow="hidden">
              {maintenanceLog.map((entry, i) => (
                <XStack
                  key={entry.id}
                  justifyContent="space-between"
                  alignItems="center"
                  paddingHorizontal="$4"
                  paddingVertical={12}
                  borderTopWidth={i === 0 ? 0 : 1}
                  borderTopColor="$neutral100"
                >
                  <YStack flex={1} gap={2}>
                    <Text fontSize={14.5} fontWeight="500">
                      {entry.description}
                    </Text>
                    <Text fontSize={12} color="$neutral500">
                      {new Date(entry.log_date).toLocaleDateString('fr-TN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </YStack>
                  {entry.cost != null && (
                    <NumericText fontSize={14.5} fontWeight="600">
                      {`${entry.cost} TND`}
                    </NumericText>
                  )}
                </XStack>
              ))}
            </YStack>
          )}
        </ScrollView>
      )}

      {activeTab === 'documents' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 100 }}>
          {currentDocuments.length === 0 ? (
            <EmptyState
              icon={CarIcon}
              title="Aucun document enregistré"
              description="Ajoutez la carte grise, le contrôle technique ou l'assurance de ce véhicule pour suivre leurs échéances."
            />
          ) : (
            <YStack gap="$2">
              {currentDocuments.map((doc) => {
                const status = daysRemainingLabel(doc.expires_at);
                return (
                  <YStack
                    key={doc.id}
                    backgroundColor="$neutral0"
                    borderRadius="$card"
                    padding="$4"
                    gap="$2"
                  >
                    <XStack justifyContent="space-between" alignItems="center">
                      <Text fontSize={15} fontWeight="600">
                        {doc.document_type}
                      </Text>
                      <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                    </XStack>
                    <Text fontSize={12} color="$neutral500">
                      {`Expire le ${new Date(doc.expires_at).toLocaleDateString('fr-TN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                    </Text>
                    <ProgressBar value={expiryProgressPercent(doc.expires_at)} />
                  </YStack>
                );
              })}
            </YStack>
          )}
        </ScrollView>
      )}

      <YStack position="absolute" bottom={24} right={20}>
        <Button
          icon={PlusIcon}
          fullWidth={false}
          onPress={activeTab === 'maintenance' ? openMaintenanceSheet : openDocumentSheet}
        >
          {activeTab === 'maintenance' ? 'Ajouter un entretien' : 'Ajouter un document'}
        </Button>
      </YStack>

      <Sheet
        visible={maintenanceSheetOpen}
        onClose={() => setMaintenanceSheetOpen(false)}
        title="Nouvelle entrée de maintenance"
      >
        <YStack gap="$3">
          <DatePicker label="Date" value={logDate} onChange={setLogDate} maximumDate={new Date()} />
          <FormField
            label="Description"
            value={logDescription}
            onChangeText={setLogDescription}
            placeholder="Ex : vidange, changement de pneus…"
          />
          <FormField
            label="Coût (optionnel)"
            value={logCost}
            onChangeText={setLogCost}
            keyboardType="numeric"
            placeholder="Montant en TND"
          />
          {logError && <Text color="$danger">{logError}</Text>}
          <Button onPress={handleSaveMaintenanceLog} loading={savingLog}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>

      <Sheet
        visible={documentSheetOpen}
        onClose={() => setDocumentSheetOpen(false)}
        title="Nouveau document"
      >
        <YStack gap="$3">
          <Select
            label="Type de document"
            value={documentType || null}
            onChange={setDocumentType}
            options={VEHICLE_DOCUMENT_TYPE_OPTIONS}
            placeholder="Choisir ou préciser…"
          />
          <DatePicker label="Date d'expiration" value={expiresAt} onChange={setExpiresAt} />
          {documentError && <Text color="$danger">{documentError}</Text>}
          <Button onPress={handleSaveDocument} loading={savingDocument}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}
