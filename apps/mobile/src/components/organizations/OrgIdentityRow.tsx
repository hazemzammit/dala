import { color } from '@dala/design-tokens';
import type { OrganizationLegalForm, OrganizationVerificationStatus } from '@dala/shared-types';
import { CheckCircleIcon } from 'phosphor-react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';

/**
 * apps/mobile/src/components/organizations/OrgIdentityRow.tsx
 *
 * Org-creation-guide follow-on. Built for collaboration.tsx's two lists
 * (orgs invited onto a project I lead / the org leading a project I'm a
 * trade on), which previously showed another org's identity as a bare
 * name string with no further context. Now also used by
 * accept-org-invite.tsx (migration 0079) and accept-invite.tsx (migration
 * 0082) — both pre-signup, anon-reachable invite screens.
 *
 * All data here must already be resolved by the caller (name/logo/
 * trade_type/legal_form/verification_status) — this component does no
 * fetching itself. For collaboration.tsx specifically, that means
 * get_shared_project_org_summaries (migration 0078), which is the only
 * thing that can actually see another org's row and its logo at all —
 * see that migration's own header for why a plain client-side
 * organizations select or Avatar-with-a-raw-logo_url doesn't work across
 * orgs. accept-org-invite.tsx and accept-invite.tsx instead get their
 * data from get_project_invitation_by_token (0079) and
 * get_worker_invitation_by_token (0082) respectively — both anon-safe,
 * token-scoped RPCs, not this same batch RPC.
 *
 * verificationStatus's badge only ever renders for 'verified' — 'pending'
 * and 'unverified' show nothing extra, matching organization-settings.tsx's
 * own existing badge (this mirrors that screen's CheckCircleIcon +
 * color.status.success choice exactly, not a new visual language).
 */
const LEGAL_FORM_LABEL: Record<OrganizationLegalForm, string> = {
  personne_physique: 'Personne physique',
  sarl: 'SARL',
  suarl: 'SUARL',
  sa: 'SA',
};

interface OrgIdentityRowProps {
  name: string;
  logoSignedUrl?: string | null;
  tradeType?: string | null;
  legalForm?: OrganizationLegalForm | null;
  verificationStatus?: OrganizationVerificationStatus | null;
  size?: 'compact' | 'default';
  onPress?: () => void;
}

export function OrgIdentityRow({
  name,
  logoSignedUrl,
  tradeType,
  legalForm,
  verificationStatus,
  size = 'default',
  onPress,
}: OrgIdentityRowProps) {
  const avatarSize = size === 'compact' ? 28 : 36;
  const subtitleParts = [tradeType, legalForm ? LEGAL_FORM_LABEL[legalForm] : null].filter(
    Boolean,
  ) as string[];

  return (
    <XStack
      alignItems="center"
      gap="$2.5"
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? name : undefined}
    >
      <Avatar name={name} imageUrl={logoSignedUrl ?? undefined} size={avatarSize} />
      <YStack flex={1}>
        <XStack alignItems="center" gap="$1.5">
          <Text fontSize={size === 'compact' ? 14.5 : 15.5} fontWeight="500" color="$neutral900">
            {name}
          </Text>
          {verificationStatus === 'verified' && (
            <CheckCircleIcon size={14} color={color.status.success} weight="fill" />
          )}
        </XStack>
        {subtitleParts.length > 0 && (
          <Text fontSize={12.5} color="$neutral500">
            {subtitleParts.join(' · ')}
          </Text>
        )}
      </YStack>
    </XStack>
  );
}
