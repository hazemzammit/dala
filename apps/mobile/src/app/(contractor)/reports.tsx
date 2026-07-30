import { generateReportSchema, type ReportType } from '@dala/validation';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ChartBarIcon, DownloadSimpleIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, Share } from 'react-native';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/reports.tsx
 *
 * Doc 03 §3.20 "Reports & exports" — built out in Phase 5 (was an
 * empty-state stub). See packages/validation/src/exports.ts's header for
 * the CSV-only scope cut at the time, and generate-report's header for
 * what payroll_summary/cnss_declaration actually are (basic aggregations,
 * not certified/filing-ready documents) — both still true.
 *
 * PHASE 6: PDF added for `progression`/`safety_summary` only (confirmed
 * scope — see delivery notes). This is the reason `expo-file-system` and
 * `expo-sharing` are now real dependencies of this app, not a Phase 5
 * "considered but cut" item anymore: `Share.share({ message })` only
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
 * No date-picker library exists in this app yet — plain YYYY-MM-DD text
 * fields rather than adding a new native dependency for one screen; a
 * calendar picker is a reasonable follow-up polish item, not required to
 * make this screen work.
 */
const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'progression', label: 'Rapport de progression' },
  { value: 'payroll_summary', label: 'Résumé de paie' },
  { value: 'cnss_declaration', label: 'Déclaration CNSS' },
  { value: 'safety_summary', label: 'Résumé de sécurité' },
];

// Only these two report types support PDF — Doc 02/03 have no spec for a
// branded PDF layout on the other two, and this was the explicitly
// confirmed scope this phase (see packages/validation/src/exports.ts).
const PDF_ELIGIBLE: ReadonlySet<ReportType> = new Set(['progression', 'safety_summary']);

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

  useFocusEffect(
    useCallback(() => {
      void getActiveOrgId().then((id) => {
        setOrgId(id);
        setChecked(true);
      });
    }, []),
  );

  function handleSelectReportType(value: ReportType) {
    setReportType(value);
    // Switching to a report type that doesn't support PDF silently falls
    // back to CSV, rather than leaving the format toggle showing a PDF
    // option that would fail validation on generate.
    if (!PDF_ELIGIBLE.has(value)) setFormat('csv');
  }

  async function handleGenerate() {
    if (!orgId) return;
    const parsed = generateReportSchema.safeParse({
      org_id: orgId,
      report_type: reportType,
      date_from: dateFrom,
      date_to: dateTo,
      format,
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
          illustration="mobile-analytics"
          title="Aucun rapport disponible"
          description="Rejoignez ou créez une organisation pour générer des rapports."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingTop={56} paddingHorizontal="$4">
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
        <FormField
          label="Du (AAAA-MM-JJ)"
          value={dateFrom}
          onChangeText={setDateFrom}
          autoCapitalize="none"
        />
        <FormField
          label="Au (AAAA-MM-JJ)"
          value={dateTo}
          onChangeText={setDateTo}
          autoCapitalize="none"
        />
      </YStack>

      {PDF_ELIGIBLE.has(reportType) && (
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

      <Button onPress={handleGenerate} loading={generating} icon={DownloadSimpleIcon}>
        {`Générer le rapport (${PDF_ELIGIBLE.has(reportType) ? format.toUpperCase() : 'CSV'})`}
      </Button>
    </YStack>
  );
}
