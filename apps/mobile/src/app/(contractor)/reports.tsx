import { generateReportSchema, type ReportType } from '@dala/validation';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { CaretDownIcon, CheckIcon, ChartBarIcon, DownloadSimpleIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, Share } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/reports.tsx
 *
 * Doc 03 §3.20 "Reports & exports" — built out in Phase 5 (was an
 * empty-state stub). See packages/validation/src/exports.ts's header for
 * the CSV-only scope cut at the time, and generate-report's header for
 * what payroll_summary actually is (a basic aggregation, not a certified/
 * filing-ready document) — still true.
 *
 * IMPROVEMENT-PLAN PHASE 1 (§7): the "Déclaration CNSS" entry has been
 * removed from `REPORT_TYPES` below — it was a mislabeled per-worker
 * attendance report, not a real CNSS filing (no employer-level CNSS field
 * exists anywhere in this schema). Third of three touch points; see
 * packages/validation/src/exports.ts and generate-report/index.ts.
 *
 * PHASE 6: PDF added, at the time for `progression`/`safety_summary` only
 * (confirmed scope — see delivery notes; IMPROVEMENT-PLAN PHASE 5 below
 * later added `payroll_summary` to that set). This is the reason
 * `expo-file-system` and `expo-sharing` are real dependencies of this app,
 * not a "considered but cut" item anymore: `Share.share({ message })` only
 * carries text, and a PDF is binary — there is no way to hand a user a
 * real PDF file through the text-message Share API. The CSV path below is
 * UNCHANGED (still `Share.share({ message })`) since text-based sharing
 * has always been genuinely fine for CSV; only the new PDF path uses
 * file-system + native share sheet. PDF file writes use the SDK 54
 * class-based `File`/`Paths` API (`expo-file-system`'s new default
 * export), not `expo-file-system/legacy` — SDK 54 deprecated the old
 * functional API (`writeAsStringAsync`, `cacheDirectory`, `EncodingType`)
 * in favor of `new File(...).write()`, which accepts raw bytes directly,
 * so the PDF's ArrayBuffer is written as a Uint8Array with no base64
 * round-trip needed.
 *
 * NAMING CHECK done before writing this (Doc 03 §3.20 vs. §2.10's separate
 * self-service export, data-export.tsx): these are two different features,
 * not the same one under two names — confirmed against Doc 03's actual
 * wording, not assumed.
 *
 * IMPROVEMENT-PLAN PHASE 5: `payroll_summary` joins `PDF_ELIGIBLE` below —
 * see `packages/validation/src/exports.ts`'s header for why (logo
 * branding landed first in this same phase, and the PDF now carries a
 * printed disclaimer). Also closes a stale comment that used to sit here:
 * "No date-picker library exists in this app yet" — that stopped being
 * true in Phase 2 (`DatePicker.tsx`), and the two date fields below now
 * use it instead of a plain YYYY-MM-DD text `FormField`.
 *
 * IMPROVEMENT-PLAN PHASE 9 (§2.6, "Timesheets -> payroll bridge"): added
 * "Fiche de paie" (`payslip`) — a per-worker payslip, PDF-only (see
 * `PDF_ONLY_REPORT_TYPES` below), requiring a worker to be picked before
 * generating. JUDGMENT CALL, disclosed: the worker picker below is a
 * small purpose-built Sheet list, NOT `components/ui/Select.tsx` — read
 * that component in full before reaching for it here and found its
 * "Autre — préciser" free-text row is unconditional (no prop suppresses
 * it, confirmed by reading its render tree), which is correct for the
 * text-column fields it already serves (trade, incident type, etc.) but
 * WRONG for this field: `worker_id` is a foreign key the generate-report
 * Edge Function looks up directly, and a free-typed string that isn't a
 * real worker's UUID would just 404 there. Reusing Select here would mean
 * either quietly allowing an invalid choice or bolting a UUID validator
 * onto a component whose whole design assumes free text is a valid
 * outcome — reasonable to keep the two ID-vs-text needs on two different
 * pickers.
 */
const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'progression', label: 'Rapport de progression' },
  { value: 'payroll_summary', label: 'Résumé de paie' },
  { value: 'safety_summary', label: 'Résumé de sécurité' },
  { value: 'payslip', label: 'Fiche de paie (par travailleur)' },
];

// Phase 5: all three curated report types support PDF (payroll_summary
// joined progression/safety_summary — see packages/validation/src/
// exports.ts's header for why). Kept as an explicit set (rather than just
// checking `reportType !== undefined`) so a future report type added to
// REPORT_TYPES without a PDF path doesn't silently show a PDF toggle that
// would fail validation on generate.
const PDF_ELIGIBLE: ReadonlySet<ReportType> = new Set([
  'progression',
  'payroll_summary',
  'safety_summary',
]);

// Phase 9 — payslip is PDF-only, not PDF-eligible-alongside-CSV like the
// other three: the format toggle is hidden entirely for it (see the JSX
// below), not just defaulted to PDF, so there's no CSV state to
// accidentally submit for a type the backend schema rejects outright.
const PDF_ONLY_REPORT_TYPES: ReadonlySet<ReportType> = new Set(['payslip']);

interface WorkerOption {
  id: string;
  full_name: string;
  trade: string | null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ReportsScreen() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>('progression');
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return isoDate(d);
  });
  const [dateTo, setDateTo] = useState(() => isoDate(new Date()));
  const [generating, setGenerating] = useState(false);
  const [checked, setChecked] = useState(false);
  // Phase 9 — payslip worker picker state. Workers are loaded lazily
  // (only once payslip is selected, not on every screen mount) since
  // every other report type never needs this list at all.
  const [workers, setWorkers] = useState<WorkerOption[] | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [workerSheetOpen, setWorkerSheetOpen] = useState(false);
  const tc = useTokenColor();

  useFocusEffect(
    useCallback(() => {
      void getActiveOrgId().then((id) => {
        setOrgId(id);
        setChecked(true);
      });
    }, []),
  );

  async function loadWorkers(org: string) {
    if (workers) return; // already loaded this session
    const { data } = await supabase
      .from('active_workers')
      .select('id, full_name, trade')
      .eq('org_id', org)
      .order('full_name');
    setWorkers((data ?? []) as WorkerOption[]);
  }

  function handleSelectReportType(value: ReportType) {
    setReportType(value);
    if (value === 'payslip') {
      // PDF-only — no toggle state to reconcile, the toggle itself is
      // hidden for this type (see JSX below).
      setFormat('pdf');
      if (orgId) void loadWorkers(orgId);
    } else if (!PDF_ELIGIBLE.has(value)) {
      // Switching to a report type that doesn't support PDF silently
      // falls back to CSV, rather than leaving the format toggle showing
      // a PDF option that would fail validation on generate.
      setFormat('csv');
    }
  }

  async function handleGenerate() {
    if (!orgId) return;
    const parsed = generateReportSchema.safeParse({
      org_id: orgId,
      report_type: reportType,
      date_from: dateFrom,
      date_to: dateTo,
      format,
      worker_id: reportType === 'payslip' ? (workerId ?? undefined) : undefined,
    });
    if (!parsed.success) {
      Alert.alert('Erreur', parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setGenerating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session invalide.');

      // Calling fetch directly rather than supabase.functions.invoke():
      // invoke()'s response-type auto-detection is built around
      // json/text, and this endpoint now returns a binary application/pdf
      // body for the PDF path — an explicit fetch + arrayBuffer() read
      // avoids relying on that auto-detection for a content-type it
      // wasn't originally built around.
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify(parsed.data),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? 'Impossible de générer le rapport.');
      }

      if (format === 'pdf') {
        const buffer = await response.arrayBuffer();
        const file = new File(Paths.cache, `${reportType}-${dateFrom}-${dateTo}.pdf`);
        // idempotent overwrite — re-generating the same report/period
        // shouldn't throw on "file already exists" from a prior run.
        file.create({ overwrite: true });
        file.write(new Uint8Array(buffer));
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
        } else {
          // Fallback for the rare device without a share sheet — at least
          // don't fail silently with the file stuck in cache.
          Alert.alert('Rapport généré', `Fichier enregistré : ${file.uri}`);
        }
      } else {
        const content = await response.text();
        await Share.share({ message: content, title: `${reportType}.csv` });
      }
      haptics.confirm();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible de générer le rapport.');
      haptics.error();
    } finally {
      setGenerating(false);
    }
  }

  if (!checked) return null;

  if (!orgId) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={ChartBarIcon}
          illustration="document-ready"
          title="Aucun rapport disponible"
          description="Rejoignez ou créez une organisation pour générer des rapports."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingHorizontal="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$1">
        Rapports
      </Text>
      <Text fontSize={14} color="$neutral500" marginBottom="$4">
        Générez un rapport pour une période donnée, prêt à partager par WhatsApp ou e-mail.
      </Text>

      <YStack gap="$1.5" marginBottom="$3">
        <Text fontSize={14} fontWeight="500">
          Type de rapport
        </Text>
        <YStack gap="$2">
          {REPORT_TYPES.map((rt) => (
            <YStack
              key={rt.value}
              padding="$3"
              borderRadius="$control"
              borderWidth={1}
              borderColor={reportType === rt.value ? '$accent600' : '$neutral200'}
              backgroundColor={reportType === rt.value ? '$neutral0' : 'transparent'}
              onPress={() => handleSelectReportType(rt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: reportType === rt.value }}
            >
              <Text
                fontSize={14.5}
                fontWeight={reportType === rt.value ? '600' : '400'}
                color={reportType === rt.value ? '$accent600' : '$neutral900'}
              >
                {rt.label}
              </Text>
            </YStack>
          ))}
        </YStack>
      </YStack>

      <YStack gap="$3" marginBottom="$4">
        {/* Phase 5 — replaces two plain YYYY-MM-DD FormFields with the
            DatePicker built in Phase 2. Bounds mirror pointage.tsx's own
            backward-only DatePicker (maximumDate={new Date()}), extended
            to a two-ended range: "Du" can't exceed "Au", and "Au" can't
            precede "Du" or exceed today — a report's date range can't be
            empty/inverted or reach into the future either end. */}
        <DatePicker
          label="Du"
          value={dateFrom}
          onChange={setDateFrom}
          maximumDate={new Date(dateTo)}
        />
        <DatePicker
          label="Au"
          value={dateTo}
          onChange={setDateTo}
          minimumDate={new Date(dateFrom)}
          maximumDate={new Date()}
        />
      </YStack>

      {reportType === 'payslip' && (
        <YStack gap="$1.5" marginBottom="$3">
          <Text fontSize={14} fontWeight="500">
            Travailleur
          </Text>
          <XStack
            alignItems="center"
            justifyContent="space-between"
            paddingVertical={12}
            paddingHorizontal="$3"
            borderRadius="$control"
            borderWidth={1}
            borderColor="$neutral200"
            backgroundColor="$neutral0"
            onPress={() => setWorkerSheetOpen(true)}
            accessibilityRole="button"
          >
            <Text fontSize={14.5} color={workerId ? '$neutral900' : '$neutral500'}>
              {workers?.find((w) => w.id === workerId)?.full_name ?? 'Sélectionner un travailleur'}
            </Text>
            <CaretDownIcon size={16} color={tc.neutral500} />
          </XStack>

          <Sheet
            visible={workerSheetOpen}
            onClose={() => setWorkerSheetOpen(false)}
            title="Travailleur"
          >
            <YStack gap="$1">
              {(workers ?? []).map((w) => {
                const active = w.id === workerId;
                return (
                  <XStack
                    key={w.id}
                    alignItems="center"
                    justifyContent="space-between"
                    paddingVertical={10}
                    paddingHorizontal="$2"
                    borderRadius="$control"
                    backgroundColor={active ? '$accent100' : 'transparent'}
                    onPress={() => {
                      setWorkerId(w.id);
                      setWorkerSheetOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <YStack>
                      <Text fontSize={15} color="$neutral900">
                        {w.full_name}
                      </Text>
                      {w.trade && (
                        <Text fontSize={12.5} color="$neutral500">
                          {w.trade}
                        </Text>
                      )}
                    </YStack>
                    {active && <CheckIcon size={17} weight="bold" color={tc.accent600} />}
                  </XStack>
                );
              })}
              {workers?.length === 0 && (
                <Text fontSize={13.5} color="$neutral500" paddingVertical="$2">
                  Aucun travailleur actif dans cette organisation.
                </Text>
              )}
            </YStack>
          </Sheet>
        </YStack>
      )}

      {PDF_ELIGIBLE.has(reportType) && !PDF_ONLY_REPORT_TYPES.has(reportType) && (
        <YStack gap="$1.5" marginBottom="$4">
          <Text fontSize={14} fontWeight="500">
            Format
          </Text>
          <SegmentedControl
            value={format}
            onChange={setFormat}
            options={[
              { value: 'csv', label: 'CSV', color: '$neutral900' },
              { value: 'pdf', label: 'PDF', color: '$neutral900' },
            ]}
          />
        </YStack>
      )}

      <Button
        onPress={handleGenerate}
        loading={generating}
        icon={DownloadSimpleIcon}
        disabled={reportType === 'payslip' && !workerId}
      >
        {`Générer le rapport (${PDF_ONLY_REPORT_TYPES.has(reportType) ? 'PDF' : PDF_ELIGIBLE.has(reportType) ? format.toUpperCase() : 'CSV'})`}
      </Button>
    </YStack>
  );
}
