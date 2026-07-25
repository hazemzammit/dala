import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import { CaretRightIcon, CheckIcon, SquaresFourIcon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import type { MyOrgSummary } from '@/lib/myOrgs';

/**
 * apps/mobile/src/components/shell/OrgSwitcherSheet.tsx
 *
 * Doc 05 §2.2 — "Tapping [the org pill] opens the bottom sheet... a
 * lightweight, tappable identity chip." Reuses the generic Sheet wrapper
 * (Doc 05 §2.1 pattern, same as PlusSheet/invite sheets) rather than a new
 * bespoke modal.
 *
 * The "Vue d'ensemble" row (Doc 02 §2.8a) only renders when the account
 * owns 2+ organizations — a single-org owner has nothing to roll up, and
 * an account that only ever belongs to orgs it doesn't own (e.g. a
 * manager/viewer on someone else's org) has no "Vue d'ensemble" concept at
 * all, since that screen is scoped to owned orgs specifically (Doc 02
 * §2.8a: "every org the user *owns*"). This is a judgment call, not
 * something Doc 02 states explicitly — flagged the same way
 * material-request's nav entry point was flagged in Phase 3: I considered
 * making Vue d'ensemble a mode of the Dashboard itself (a toggle at the
 * top), but the Dashboard's data shape is fundamentally single-org
 * (Doc 03 §3.9, activeOrg-scoped queries throughout Phase 1-3), while Vue
 * d'ensemble's shape is N independent per-org fetches composed side by
 * side — different enough to warrant its own route rather than a second
 * mode bolted onto Dashboard. Surfacing it here, in the same sheet where
 * the person is already choosing between their orgs, is the more
 * discoverable placement of the two real options (the other being
 * Settings, which doesn't exist as a built screen yet either).
 */
interface OrgSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  orgs: MyOrgSummary[];
  ownedOrgCount: number;
  activeOrgId: string | null;
  onSelect: (orgId: string) => void;
}

export function OrgSwitcherSheet({
  visible,
  onClose,
  orgs,
  ownedOrgCount,
  activeOrgId,
  onSelect,
}: OrgSwitcherSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Changer d'entreprise">
      <YStack gap="$1">
        {ownedOrgCount >= 2 && (
          <XStack
            alignItems="center"
            gap="$3"
            paddingVertical={12}
            paddingHorizontal="$2"
            borderRadius="$control"
            backgroundColor="$accent50"
            marginBottom="$2"
            onPress={() => {
              onClose();
              router.push('/vue-ensemble');
            }}
            accessibilityRole="button"
          >
            <SquaresFourIcon size={20} color={color.accent[600]} weight="bold" />
            <YStack flex={1}>
              <Text fontSize={15} fontWeight="600" color="$accent600">
                Vue d&apos;ensemble
              </Text>
              <Text fontSize={12.5} color="$neutral500">
                Toutes vos entreprises, côte à côte
              </Text>
            </YStack>
            <CaretRightIcon size={16} color={color.accent[600]} />
          </XStack>
        )}

        {orgs.map((org) => {
          const active = org.org_id === activeOrgId;
          return (
            <XStack
              key={org.org_id}
              alignItems="center"
              gap="$3"
              paddingVertical={12}
              onPress={() => onSelect(org.org_id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Avatar name={org.name} />
              <YStack flex={1}>
                <Text fontSize={15.5} fontWeight="500">
                  {org.name}
                </Text>
                <Text fontSize={12.5} color="$neutral500">
                  {ROLE_LABEL[org.role]}
                </Text>
              </YStack>
              {active && <CheckIcon size={18} color={color.accent[600]} weight="bold" />}
            </XStack>
          );
        })}
      </YStack>
    </Sheet>
  );
}

const ROLE_LABEL: Record<MyOrgSummary['role'], string> = {
  owner: 'Propriétaire',
  manager: 'Gestionnaire',
  viewer: 'Lecture seule',
};
