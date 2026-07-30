import { requestDataExportSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { DownloadSimpleIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, Share } from 'react-native';
import { Text, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/data-export.tsx
 *
 * NEW in Phase 5 — Doc 02 §2.10 self-service data export. Doc 01 §1.16
 * doesn't exist to specify this (confirmed before writing this screen), so
 * scope here is a PROPOSAL, stated as such rather than presented as spec:
 * a CSV/JSON dump of the org's own data via the new `export-org-data` Edge
 * Function, owner/manager only (it includes financial rows).
 *
 * SCOPE CUT: shares the resulting text via React Native's built-in
 * `Share.share()` rather than a proper "save file to device" flow — that
 * would need `expo-file-system` + `expo-sharing`, two new native
 * dependencies not currently in this app, for what a share-sheet can
 * already do reasonably for a text export. Worth revisiting once export
 * sizes grow past what's comfortable to hand through Share's message
 * field.
 */
export default function DataExportScreen() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [exporting, setExporting] = useState(false);
  const [checked, setChecked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void check();
    }, []),
  );

  async function check() {
    const org = await getActiveOrgId();
    setOrgId(org);
    if (org) {
      const role = await getMyOrgRole(org);
      setAllowed(role === 'owner' || role === 'manager');
    }
    setChecked(true);
  }

  async function handleExport() {
    if (!orgId) return;
    const parsed = requestDataExportSchema.safeParse({ org_id: orgId, format });
    if (!parsed.success) {
      haptics.error();
      return;
    }

    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-org-data', {
        body: parsed.data,
      });
      if (error) throw error;

      const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
      await Share.share({ message: content, title: `Export Dala (${format.toUpperCase()})` });
      haptics.confirm();
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? "Impossible de générer l'export.");
      haptics.error();
    } finally {
      setExporting(false);
    }
  }

  if (!checked) return null;

  if (!allowed) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={DownloadSimpleIcon}
          illustration="export-files"
          title="Réservé au propriétaire ou gestionnaire"
          description="Seuls les rôles Propriétaire et Gestionnaire peuvent exporter les données de l'entreprise, car cet export inclut des informations financières."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingTop={56} paddingHorizontal="$4">
      <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$2">
        Exporter mes données
      </Text>
      <Text fontSize={14} color="$neutral500" marginBottom="$4">
        Téléchargez l&apos;ensemble des données de votre entreprise (chantiers, équipe, dispatch,
        avances, dépenses, matériaux, journal, sécurité, assurances) au format de votre choix.
      </Text>

      <YStack gap="$1.5" marginBottom="$4">
        <Text fontSize={14} fontWeight="500">
          Format
        </Text>
        <SegmentedControl
          value={format}
          onChange={setFormat}
          options={[
            { value: 'csv', label: 'CSV', color: '$accent600' },
            { value: 'json', label: 'JSON', color: '$accent600' },
          ]}
        />
      </YStack>

      <Button onPress={handleExport} loading={exporting} icon={DownloadSimpleIcon}>
        Générer l&apos;export
      </Button>
    </YStack>
  );
}
