import { router } from 'expo-router';
import { CaretRightIcon, CheckIcon, PlusIcon, SquaresFourIcon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import type { MyOrgSummary } from '@/lib/myOrgs';
import { useTokenColor } from '@/lib/useTokenColor';

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
 *
 * Round 2 audit (§1.9) — the pill is now always rendered (dashboard.tsx no
 * longer hides it for single-org accounts), which surfaced a real gap:
 * there was no "add another organization" destination anywhere in the
 * app, even though the backend RPC for it
 * (`create_organization_for_current_user`, migration 0014) had existed
 * since Phase 1 — see create-organization.tsx's own header for the full
 * finding. Added as a row at the bottom of the org list (always visible,
 * not conditional on org count, same reasoning as the pill itself: a
 * single-org owner is exactly who most needs the "add one" path, not
 * only someone who already has several).
 */
interface OrgSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  orgs: MyOrgSummary[];
  ownedOrgCount: number;
  activeOrgId: string | null;
  onSelect: (orgId: string) => void;
  // Bug fix — logo_url is a private-bucket storage PATH, not a fetchable
  // URL. The caller (dashboard.tsx) already resolves every org's logo
  // through getSignedUrlMap for its own header avatar; this sheet needs
  // the same resolved map rather than each row re-signing (or, as
  // before this fix, silently failing to sign at all) its own logo.
  logoUrlByPath: Record<string, string>;
}

export function OrgSwitcherSheet({
  visible,
  onClose,
  orgs,
  ownedOrgCount,
  activeOrgId,
  onSelect,
  logoUrlByPath,
}: OrgSwitcherSheetProps) {
  const tc = useTokenColor();
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
            <SquaresFourIcon size={20} color={tc.accent600} weight="bold" />
            <YStack flex={1}>
              <Text fontSize={15} fontWeight="600" color="$accent600">
                Vue d&apos;ensemble
              </Text>
              <Text fontSize={12.5} color="$neutral500">
                Toutes vos entreprises, côte à côte
              </Text>
            </YStack>
            <CaretRightIcon size={16} color={tc.accent600} />
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
              <Avatar
                name={org.name}
                imageUrl={org.logo_url ? logoUrlByPath[org.logo_url] : undefined}
              />
              <YStack flex={1}>
                <Text fontSize={15.5} fontWeight="500">
                  {org.name}
                </Text>
                <Text fontSize={12.5} color="$neutral500">
                  {ROLE_LABEL[org.role]}
                </Text>
              </YStack>
              {active && <CheckIcon size={18} color={tc.accent600} weight="bold" />}
            </XStack>
          );
        })}

        <XStack
          alignItems="center"
          gap="$3"
          paddingVertical={12}
          marginTop="$1"
          borderTopWidth={1}
          borderTopColor="$neutral100"
          onPress={() => {
            onClose();
            router.push('/create-organization');
          }}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une organisation"
        >
          <XStack
            width={32}
            height={32}
            borderRadius={16}
            alignItems="center"
            justifyContent="center"
            backgroundColor="$neutral100"
          >
            <PlusIcon size={16} weight="bold" color={tc.neutral500} />
          </XStack>
          <Text fontSize={15.5} fontWeight="500" color="$neutral900">
            Ajouter une organisation
          </Text>
        </XStack>
      </YStack>
    </Sheet>
  );
}

const ROLE_LABEL: Record<MyOrgSummary['role'], string> = {
  owner: 'Propriétaire',
  manager: 'Gestionnaire',
  viewer: 'Lecture seule',
};
