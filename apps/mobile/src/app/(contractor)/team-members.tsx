import { color } from '@dala/design-tokens';
import type { OrganizationMemberInvitation } from '@dala/shared-types';
import {
  inviteOrganizationMemberSchema,
  updateOrganizationMemberRoleSchema,
} from '@dala/validation';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CopyIcon,
  PlusIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/team-members.tsx
 *
 * Phase 7 — Doc 03 §3.22 "Membres de l'équipe." Phase 9 added the
 * invite-by-email pipeline (migration 0030, table + RPCs) that Phase 7
 * deliberately cut. Phase 10 closes the gap Phase 9 itself left open —
 * the invitation row existed but nothing sent it — by wiring actual
 * delivery through send-organization-invitation-email (Resend), plus
 * resend and copy-link actions on each pending row.
 *
 * Deliberately a DIFFERENT screen from the existing team.tsx (Doc 03
 * §3.13), which manages this org's WORKERS (field employees — the
 * `workers` table). This screen manages `organization_members` — the
 * owner/manager/viewer app-level accounts. Doc 03 §3.22's one line item
 * conflates two entities that are actually completely separate tables/
 * concepts in this schema; splitting them into two screens (reusing the
 * existing worker-focused team.tsx exactly as-is) was judged clearer than
 * cramming both member types into one list with two different shapes.
 */
interface MemberRow {
  user_id: string;
  role: 'owner' | 'manager' | 'viewer';
  joined_at: string;
  full_name: string;
}

// Phase 10: the local InvitationRow interface that used to live here is
// gone — @dala/shared-types now has OrganizationMemberInvitation (added
// this phase; the table/RPCs shipped in Phase 9 without a shared type).
// This screen only ever needs a subset of its columns, hence the Pick.
type InvitationRow = Pick<
  OrganizationMemberInvitation,
  'id' | 'invited_email' | 'role' | 'status' | 'expires_at' | 'token'
>;

const ROLE_LABEL: Record<MemberRow['role'], string> = {
  owner: 'Propriétaire',
  manager: 'Manager',
  viewer: 'Observateur',
};

export default function TeamMembersScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [roleSheetMember, setRoleSheetMember] = useState<MemberRow | null>(null);
  // Themed ConfirmDialog replacing Alert.alert's destructive two-button variant.
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'viewer'>('viewer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [emailSendWarning, setEmailSendWarning] = useState<string | null>(null);

  // Per-invitation-row transient UI state — id-keyed since several
  // invitations can be pending at once and each row acts independently.
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const activeOrgId = await getActiveOrgId();
    if (!activeOrgId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setOrgId(activeOrgId);

    const role = await getMyOrgRole(activeOrgId);
    setIsOwner(role === 'owner');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setMyUserId(session?.user.id ?? null);

    const { data: memberRows } = await supabase
      .from('organization_members')
      .select('user_id, role, joined_at')
      .eq('org_id', activeOrgId);

    const userIds = (memberRows ?? []).map((m) => m.user_id);
    let nameById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      nameById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]));
    }

    const merged: MemberRow[] = (memberRows ?? [])
      .map((m) => ({ ...m, full_name: nameById[m.user_id] ?? 'Membre' }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    setMembers(merged);

    // Only pending ones are worth showing — accepted invitations are
    // already reflected as real rows above, and expired ones are just
    // noise once a new invite has been (re)sent to the same address.
    const { data: invitationRows } = await supabase
      .from('organization_member_invitations')
      .select('id, invited_email, role, status, expires_at, token')
      .eq('org_id', activeOrgId)
      .eq('status', 'pending')
      .order('sent_at', { ascending: false });

    setInvitations((invitationRows ?? []) as InvitationRow[]);
    setLoading(false);
    setRefreshing(false);
  }

  // Fire-and-report, never fire-and-throw: a failed email send shouldn't
  // undo the invitation row that already exists (same reasoning
  // accept-organization-invitation's own non-fatal status-update failure
  // uses) — the invite is still valid and the invitations list still shows
  // it. The caller surfaces the returned message as a soft warning, not a
  // blocking error.
  async function sendInvitationEmail(invitationId: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('send-organization-invitation-email', {
      body: { invitation_id: invitationId },
    });
    if (error || !data?.success) {
      return "L'invitation a été créée, mais l'e-mail n'a pas pu être envoyé. Utilisez \"Copier le lien\" pour le partager vous-même.";
    }
    return null;
  }

  async function handleInvite() {
    setInviteError(null);
    setEmailSendWarning(null);
    const parsed = inviteOrganizationMemberSchema.safeParse({
      org_id: orgId,
      email: inviteEmail,
      role: inviteRole,
    });
    if (!parsed.success) {
      setInviteError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setInviteSubmitting(true);
    try {
      const { data: invitationId, error } = await supabase.rpc('invite_organization_member', {
        p_org_id: parsed.data.org_id,
        p_email: parsed.data.email,
        p_role: parsed.data.role,
      });
      if (error || !invitationId) {
        setInviteError('Impossible d’envoyer l’invitation.');
        haptics.error();
        return;
      }

      const warning = await sendInvitationEmail(invitationId);
      haptics.confirm();
      toast.success('Invitation envoyée.');
      setInviteSheetOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
      await load();
      if (warning) {
        // Still a confirm(), not error() — the invitation itself succeeded,
        // matching the haptics table's "meaningful moment" gate (§1.4a):
        // this is a degraded-but-successful outcome, not a failure.
        setEmailSendWarning(warning);
      }
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function handleResendInvite(inv: InvitationRow) {
    setResendingId(inv.id);
    try {
      const { data: invitationId, error } = await supabase.rpc('invite_organization_member', {
        p_org_id: orgId,
        p_email: inv.invited_email,
        p_role: inv.role,
      });
      if (error || !invitationId) {
        toast.error("Impossible de renvoyer l'invitation.");
        haptics.error();
        return;
      }
      const warning = await sendInvitationEmail(invitationId);
      if (warning) {
        toast.info(warning);
      } else {
        toast.success(`Un nouvel e-mail a été envoyé à ${inv.invited_email}.`);
      }
      haptics.confirm();
      await load();
    } finally {
      setResendingId(null);
    }
  }

  async function handleCopyInviteLink(inv: InvitationRow) {
    // Mobile-only deep link, matching what
    // send-organization-invitation-email's own copy sends — see that
    // function's header for why there's no web fallback URL here.
    const url = `dala://accept-organization-invite?token=${inv.token}`;
    await Clipboard.setStringAsync(url);
    setCopiedId(inv.id);
    haptics.confirm();
    setTimeout(() => setCopiedId((current) => (current === inv.id ? null : current)), 2000);
  }

  async function handleRoleChange(member: MemberRow, newRole: MemberRow['role']) {
    const parsed = updateOrganizationMemberRoleSchema.safeParse({
      user_id: member.user_id,
      role: newRole,
    });
    if (!parsed.success || !orgId) return;

    const { error } = await supabase.rpc('update_organization_member_role', {
      p_org_id: orgId,
      p_user_id: parsed.data.user_id,
      p_role: parsed.data.role,
    });
    if (error) {
      toast.error(
        error.message.includes('propriétaire')
          ? 'Cette organisation doit conserver au moins un propriétaire.'
          : 'Impossible de modifier ce rôle.',
      );
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Rôle mis à jour.');
    setRoleSheetMember(null);
    await load();
  }

  function confirmRemove(member: MemberRow) {
    setRoleSheetMember(null);
    setRemoveTarget(member);
  }

  async function handleRemove() {
    if (!orgId || !removeTarget) return;
    setRemoving(true);
    const { error } = await supabase.rpc('remove_organization_member', {
      p_org_id: orgId,
      p_user_id: removeTarget.user_id,
    });
    setRemoving(false);
    if (error) {
      toast.error(
        error.message.includes('propriétaire')
          ? 'Cette organisation doit conserver au moins un propriétaire.'
          : 'Impossible de retirer ce membre.',
      );
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success(`${removeTarget.full_name} a été retiré.`);
    setRemoveTarget(null);
    await load();
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack paddingHorizontal="$4" paddingBottom="$3" alignItems="center" gap="$3">
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={20} />
        </XStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600">
          Membres de l'équipe
        </Text>
      </XStack>

      {members.length === 0 ? (
        <EmptyState
          icon={UsersThreeIcon}
          illustration="team"
          title="Aucun membre"
          description="Les membres de votre organisation apparaîtront ici."
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={color.accent[600]}
            />
          }
        >
          <YStack gap="$2">
            {members.map((member) => (
              <XStack
                key={member.user_id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                alignItems="center"
                gap="$3"
                onPress={isOwner ? () => setRoleSheetMember(member) : undefined}
                accessibilityRole="button"
                accessibilityLabel={member.full_name}
              >
                <Avatar name={member.full_name} size={40} />
                <YStack flex={1}>
                  <Text fontSize={15} fontWeight="600">
                    {member.full_name}
                    {member.user_id === myUserId ? ' (Vous)' : ''}
                  </Text>
                </YStack>
                <StatusBadge variant={member.role === 'owner' ? 'info' : 'neutral'}>
                  {ROLE_LABEL[member.role]}
                </StatusBadge>
              </XStack>
            ))}
          </YStack>

          {invitations.length > 0 && (
            <YStack gap="$2" marginTop="$4">
              <Text fontSize={13} fontWeight="600" color="$neutral500">
                INVITATIONS EN ATTENTE
              </Text>
              {invitations.map((inv) => (
                <YStack
                  key={inv.id}
                  backgroundColor="$neutral0"
                  borderRadius="$card"
                  padding="$4"
                  gap="$3"
                >
                  <XStack alignItems="center" gap="$3">
                    <Avatar name={inv.invited_email} size={40} />
                    <YStack flex={1}>
                      <Text fontSize={15} fontWeight="600">
                        {inv.invited_email}
                      </Text>
                    </YStack>
                    <StatusBadge variant="warning">{ROLE_LABEL[inv.role]}</StatusBadge>
                  </XStack>
                  {isOwner && (
                    <XStack gap="$4">
                      <Button
                        variant="text"
                        fullWidth={false}
                        icon={ArrowsClockwiseIcon}
                        loading={resendingId === inv.id}
                        onPress={() => void handleResendInvite(inv)}
                      >
                        Renvoyer
                      </Button>
                      <Button
                        variant="text"
                        fullWidth={false}
                        icon={CopyIcon}
                        onPress={() => void handleCopyInviteLink(inv)}
                      >
                        {copiedId === inv.id ? 'Copié !' : 'Copier le lien'}
                      </Button>
                    </XStack>
                  )}
                </YStack>
              ))}
            </YStack>
          )}

          {isOwner && (
            <YStack
              backgroundColor="$neutral0"
              borderRadius="$card"
              padding="$4"
              marginTop="$4"
              gap="$2"
              onPress={() => setInviteSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Inviter un membre par e-mail"
            >
              <XStack alignItems="center" gap="$2">
                <PlusIcon size={16} color={color.accent[600]} />
                <Text fontSize={14} color="$accent600" fontWeight="600">
                  Inviter un membre par e-mail
                </Text>
              </XStack>
            </YStack>
          )}
        </ScrollView>
      )}

      <Sheet
        visible={roleSheetMember !== null}
        onClose={() => setRoleSheetMember(null)}
        title={roleSheetMember?.full_name ?? ''}
      >
        {roleSheetMember && (
          <YStack gap="$2">
            {(['owner', 'manager', 'viewer'] as const).map((r) => (
              <XStack
                key={r}
                paddingVertical={14}
                justifyContent="space-between"
                alignItems="center"
                onPress={() => void handleRoleChange(roleSheetMember, r)}
                accessibilityRole="button"
                accessibilityLabel={ROLE_LABEL[r]}
              >
                <Text fontSize={15} fontWeight={roleSheetMember.role === r ? '700' : '400'}>
                  {ROLE_LABEL[r]}
                </Text>
              </XStack>
            ))}
            <XStack paddingTop="$2">
              <Text
                fontSize={14}
                color="$danger"
                fontWeight="600"
                onPress={() => confirmRemove(roleSheetMember)}
                accessibilityRole="button"
                accessibilityLabel="Retirer ce membre"
              >
                Retirer ce membre de l'organisation
              </Text>
            </XStack>
          </YStack>
        )}
      </Sheet>

      <Sheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
        title="Inviter un membre"
      >
        <YStack gap="$3">
          <FormField
            label="E-mail"
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="nom@exemple.com"
          />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Rôle
            </Text>
            <SegmentedControl
              value={inviteRole}
              options={[
                { value: 'manager', label: 'Manager', color: '$accent600' },
                { value: 'viewer', label: 'Observateur', color: '$neutral500' },
              ]}
              onChange={(v) => setInviteRole(v as 'manager' | 'viewer')}
            />
          </YStack>

          {inviteError && <Text color="$danger">{inviteError}</Text>}

          <Button onPress={handleInvite} loading={inviteSubmitting}>
            Envoyer l&apos;invitation
          </Button>

          {/* Phase 10: the e-mail is now actually sent (see
              send-organization-invitation-email, via the existing Resend
              helper) — the stale "not connected yet" note that lived here
              through Phase 9 no longer applies. If delivery fails, the
              invitation row still exists and "Copier le lien" on each
              pending row remains the manual fallback, same as before. */}
          <Text fontSize={12.5} color="$neutral500" textAlign="center">
            Un e-mail avec le lien d&apos;invitation sera envoyé automatiquement.
          </Text>
        </YStack>
      </Sheet>

      <Sheet
        visible={emailSendWarning !== null}
        onClose={() => setEmailSendWarning(null)}
        title="Invitation créée"
      >
        <YStack gap="$3">
          <Text fontSize={14.5} color="$neutral700">
            {emailSendWarning}
          </Text>
          <Button onPress={() => setEmailSendWarning(null)}>Compris</Button>
        </YStack>
      </Sheet>

      <ConfirmDialog
        visible={removeTarget !== null}
        title="Retirer ce membre ?"
        description={
          removeTarget
            ? `${removeTarget.full_name} perdra l'accès à cette organisation. Son compte n'est pas supprimé.`
            : undefined
        }
        confirmLabel="Retirer"
        loading={removing}
        onConfirm={() => void handleRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </YStack>
  );
}
