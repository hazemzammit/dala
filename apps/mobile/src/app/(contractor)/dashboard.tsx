import { router, useFocusEffect } from 'expo-router';
import { BuildingsIcon, CaretDownIcon, CaretRightIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { OrgSwitcherSheet } from '@/components/shell/OrgSwitcherSheet';
import { getActiveOrgId, setActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { listMyOrganizations, listOwnedOrganizations, type MyOrgSummary } from '@/lib/myOrgs';

/**
 * Doc 03 §3.9 — Home/Dashboard. Placeholder; replace with the real
 * single-column stat-card layout (mobile keeps single-column per Doc 00
 * §0.4, unlike web's denser multi-widget grid).
 *
 * SCOPE NOTE: Phase 4's brief is multi-org collaboration, not "build the
 * dashboard" — Doc 03 §3.9's full home (hero card, dispatch summary,
 * activity feed) is a separate, larger piece of work that stays out of
 * this pass. What Phase 4 DOES add here is the org-switcher pill (Doc 05
 * §2.2: "pinned directly under the greeting on Home... tapping it opens
 * the bottom sheet"), because Vue d'ensemble (Doc 02 §2.8a) needs a real
 * entry point and that pill/sheet is where Doc 05 says it belongs. This is
 * the minimum slice of Dashboard needed to make that entry point exist —
 * not a signal that the rest of §3.9 has been built.
 *
 * PHASE 6: same minimum-slice reasoning adds one more row here — an entry
 * point to the new multi-project rollup screen (project-rollup.tsx, Doc 02
 * §2.10). Doesn't touch the rest of §3.9 either.
 */
export default function DashboardScreen() {
  const [orgs, setOrgs] = useState<MyOrgSummary[]>([]);
  const [ownedCount, setOwnedCount] = useState(0);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    const [all, owned, active] = await Promise.all([
      listMyOrganizations(),
      listOwnedOrganizations(),
      getActiveOrgId(),
    ]);
    setOrgs(all);
    setOwnedCount(owned.length);
    setActiveOrgIdState(active);
  }

  async function handleSelect(orgId: string) {
    setSheetOpen(false);
    if (orgId === activeOrgId) return;
    const ok = await setActiveOrgId(orgId);
    if (ok) {
      haptics.confirm();
      setActiveOrgIdState(orgId);
    } else {
      haptics.error();
    }
  }

  const activeOrg = orgs.find((o) => o.org_id === activeOrgId);

  return (
    <YStack flex={1} backgroundColor="$neutral25" padding="$4" gap="$3">
      <Text fontFamily="$display" fontSize={23} fontWeight="600">
        Bonjour 👋
      </Text>

      {/* Doc 05 §2.2 — org-switcher pill. Only rendered once org data has
          loaded and there's something to switch between/toward (2+ orgs
          total, OR 2+ owned orgs so Vue d'ensemble is reachable) — a
          single-org account has nothing this pill would let them do. */}
      {(orgs.length > 1 || ownedCount > 1) && activeOrg && (
        <XStack
          alignSelf="flex-start"
          alignItems="center"
          gap="$2"
          backgroundColor="$neutral0"
          borderRadius={999}
          paddingVertical={8}
          paddingHorizontal={14}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Changer d'entreprise"
        >
          <Text fontSize={14} fontWeight="500">
            {activeOrg.name}
          </Text>
          <CaretDownIcon size={14} weight="bold" />
        </XStack>
      )}

      <OrgSwitcherSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        orgs={orgs}
        ownedOrgCount={ownedCount}
        activeOrgId={activeOrgId}
        onSelect={handleSelect}
      />

      {/* Phase 6 — entry point to the multi-project rollup screen (Doc 02
          §2.10). Always shown regardless of org count, unlike the pill
          above — every account with an active org has projects worth
          rolling up, even a single-org one. */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        backgroundColor="$neutral0"
        borderRadius="$card"
        padding="$4"
        onPress={() => router.push('/project-rollup')}
        accessibilityRole="button"
        accessibilityLabel="Voir tous les chantiers"
      >
        <XStack alignItems="center" gap="$3">
          <BuildingsIcon size={20} weight="bold" />
          <Text fontSize={15} fontWeight="500">
            Chantiers
          </Text>
        </XStack>
        <CaretRightIcon size={16} color="$neutral500" />
      </XStack>
    </YStack>
  );
}
