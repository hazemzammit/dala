import type { Project, ProjectInvitation, ProjectMembership } from '@dala/shared-types';
import { inviteOrgToProjectSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { HandshakeIcon, PlusIcon, UsersThreeIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { FAB } from '@/components/shell/FAB';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/collaboration.tsx
 *
 * Doc 02 §2.8 — multi-org collaboration. Replaces the placeholder stub.
 *
 * SCOPE NOTE, stated plainly rather than silently built around: there is
 * no dedicated project-detail screen anywhere in the mobile app yet — even
 * apps/mobile/src/app/(contractor)/projects.tsx is still the Phase-0/1
 * empty-state stub with no real list. So "wherever a multi-org project
 * view exists today" (the brief's phrasing) resolves to: nowhere yet — and
 * this screen, Collaboration, is what I'm building AS that view for
 * Phase 4's purposes, rather than inventing a generic project-detail
 * screen that doesn't exist as a concept anywhere else in the app. Each
 * project card here shows exactly what a multi-org membership view needs
 * (member orgs, roles, the two per-membership flags) — it is intentionally
 * NOT a general chantier detail screen (no budget/task/schedule content;
 * that's Projects' own eventual scope, untouched here).
 *
 * Two independent lists, since a project's own org can be lead on some
 * projects and trade on others simultaneously:
 *   - "Mes chantiers partagés": projects MY org leads, with the orgs I've
 *     invited onto them (+ pending invitations) and an invite action.
 *   - "Chantiers auxquels je participe": projects another org leads and
 *     invited MY org onto as a trade — where MY org's own
 *     budget-rollup/report-branding flags on that membership live.
 */
interface LedProjectRow {
  project: Project;
  members: (ProjectMembership & { org_name: string })[];
  pendingInvites: ProjectInvitation[];
}

interface TradeProjectRow {
  membership: ProjectMembership;
  project: { id?: string; name: string; client_name: string | null };
  leadOrgName: string;
}

export default function CollaborationScreen() {
  const [loading, setLoading] = useState(true);
  const [ledProjects, setLedProjects] = useState<LedProjectRow[]>([]);
  const [tradeProjects, setTradeProjects] = useState<TradeProjectRow[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [invitedPhone, setInvitedPhone] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [sentVia, setSentVia] = useState<'whatsapp' | 'sms' | 'email'>('whatsapp');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    if (!org) {
      setLoading(false);
      return;
    }

    // --- Projects I lead -----------------------------------------------
    const { data: led } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', org)
      .is('deleted_at', null)
      .order('name');

    const ledIds = (led ?? []).map((p) => p.id);

    const { data: memberships } = ledIds.length
      ? await supabase
          .from('project_memberships')
          .select('*, organizations(name)')
          .in('project_id', ledIds)
      : { data: [] as any[] };

    const { data: pending } = ledIds.length
      ? await supabase
          .from('project_invitations')
          .select('*')
          .in('project_id', ledIds)
          .eq('status', 'pending')
      : { data: [] as ProjectInvitation[] };

    const ledRows: LedProjectRow[] = (led ?? []).map((project) => ({
      project,
      members: (memberships ?? [])
        .filter((m: any) => m.project_id === project.id)
        .map((m: any) => ({ ...m, org_name: m.organizations?.name ?? '—' })),
      pendingInvites: (pending ?? []).filter((i) => i.project_id === project.id),
    }));
    setLedProjects(ledRows);

    // --- Projects I'm a trade participant on ----------------------------
    const { data: tradeMemberships } = await supabase
      .from('project_memberships')
      .select('*')
      .eq('org_id', org)
      .eq('role', 'trade');

    const tradeProjectIds = (tradeMemberships ?? []).map((m) => m.project_id);
    const { data: tradeProjectRows } = tradeProjectIds.length
      ? await supabase
          .from('projects')
          .select('id, name, client_name, lead_org_id')
          .in('id', tradeProjectIds)
      : { data: [] as any[] };

    const leadOrgIds = [...new Set((tradeProjectRows ?? []).map((p: any) => p.lead_org_id))];
    const { data: leadOrgs } = leadOrgIds.length
      ? await supabase.from('organizations').select('id, name').in('id', leadOrgIds)
      : { data: [] as any[] };

    const tradeRows: TradeProjectRow[] = (tradeMemberships ?? []).map((membership) => {
      const project = (tradeProjectRows ?? []).find((p: any) => p.id === membership.project_id);
      const leadOrg = (leadOrgs ?? []).find((o: any) => o.id === project?.lead_org_id);
      return {
        membership,
        project: {
          id: project?.id,
          name: project?.name ?? '—',
          client_name: project?.client_name ?? null,
        },
        leadOrgName: leadOrg?.name ?? '—',
      };
    });
    setTradeProjects(tradeRows);

    setLoading(false);
  }

  function openInvite() {
    setSelectedProjectId(ledProjects[0]?.project.id ?? '');
    setInvitedPhone('');
    setInvitedEmail('');
    setTradeType('');
    setSentVia('whatsapp');
    setError(null);
    setSheetOpen(true);
  }

  async function handleInvite() {
    setError(null);

    const parsed = inviteOrgToProjectSchema.safeParse({
      project_id: selectedProjectId,
      invited_phone: invitedPhone || undefined,
      invited_email: invitedEmail || undefined,
      trade_type: tradeType || undefined,
      sent_via: sentVia,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('invite_org_to_project', {
        p_project_id: parsed.data.project_id,
        p_invited_phone: parsed.data.invited_phone ?? null,
        p_invited_email: parsed.data.invited_email ?? null,
        p_trade_type: parsed.data.trade_type ?? null,
        p_sent_via: parsed.data.sent_via,
      });
      if (rpcError) throw rpcError;

      // Same division of labor as invite_worker (Phase 1): the row existing
      // is what the accept-org-invite screen depends on; actually sending
      // the WhatsApp/SMS/email carrying the `dala://accept-org-invite?
      // token=...` link is a notification-dispatch concern, not built in
      // this pass (identical scope boundary to team.tsx's own invite flow).
      haptics.confirm();
      setSheetOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Une erreur est survenue. Réessayez.');
      haptics.error();
    } finally {
      setSaving(false);
    }
  }

  async function toggleMembershipFlag(
    membership: ProjectMembership,
    field: 'budget_rollup_opt_in' | 'report_branding_opt_out',
    value: boolean,
  ) {
    const { error: updateError } = await supabase
      .from('project_memberships')
      .update({ [field]: value })
      .eq('id', membership.id);

    if (updateError) {
      haptics.error();
      Alert.alert('Erreur', 'Impossible de mettre à jour ce réglage.');
      return;
    }
    haptics.confirm();
    await load();
  }

  const isEmpty = ledProjects.length === 0 && tradeProjects.length === 0;

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (isEmpty) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={UsersThreeIcon}
          illustration="team-collaboration"
          title="Aucune collaboration inter-entreprises"
          description="Les chantiers partagés avec d'autres entreprises apparaîtront ici."
        />
        <FAB icon={PlusIcon} accessibilityLabel="Inviter une entreprise" onPress={openInvite} />
        {renderSheet()}
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Collaboration
        </Text>

        {ledProjects.length > 0 && (
          <YStack gap="$3" marginBottom="$5">
            <Text fontSize={14} fontWeight="600" color="$neutral500">
              MES CHANTIERS PARTAGÉS
            </Text>
            {ledProjects.map((row) => (
              <YStack
                key={row.project.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                gap="$3"
              >
                <Text fontSize={15.5} fontWeight="600">
                  {row.project.name}
                </Text>

                {row.members.length === 0 && row.pendingInvites.length === 0 && (
                  <Text fontSize={13} color="$neutral500">
                    Aucune entreprise invitée sur ce chantier.
                  </Text>
                )}

                {row.members
                  .filter((m) => m.role === 'trade')
                  .map((m) => (
                    <XStack key={m.id} alignItems="center" gap="$3" justifyContent="space-between">
                      <XStack alignItems="center" gap="$3" flex={1}>
                        <Avatar name={m.org_name} size={28} />
                        <Text fontSize={14.5}>{m.org_name}</Text>
                      </XStack>
                      <StatusBadge variant={m.budget_rollup_opt_in ? 'success' : 'neutral'}>
                        {m.budget_rollup_opt_in ? 'Budget partagé' : 'Budget privé'}
                      </StatusBadge>
                    </XStack>
                  ))}

                {row.pendingInvites.map((inv) => (
                  <XStack key={inv.id} alignItems="center" justifyContent="space-between">
                    <Text fontSize={13.5} color="$neutral500">
                      {inv.invited_email || inv.invited_phone}
                      {inv.trade_type ? ` · ${inv.trade_type}` : ''}
                    </Text>
                    <StatusBadge variant="warning">Invitation envoyée</StatusBadge>
                  </XStack>
                ))}
              </YStack>
            ))}
          </YStack>
        )}

        {tradeProjects.length > 0 && (
          <YStack gap="$3">
            <Text fontSize={14} fontWeight="600" color="$neutral500">
              CHANTIERS AUXQUELS JE PARTICIPE
            </Text>
            {tradeProjects.map((row) => (
              <YStack
                key={row.membership.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                gap="$3"
              >
                <YStack>
                  <Text fontSize={15.5} fontWeight="600">
                    {row.project.name}
                  </Text>
                  <Text fontSize={13} color="$neutral500">
                    Chantier dirigé par {row.leadOrgName}
                  </Text>
                </YStack>

                <XStack alignItems="center" justifyContent="space-between">
                  <YStack flex={1} paddingRight="$2">
                    <Text fontSize={14} fontWeight="500">
                      Partager mon budget consommé
                    </Text>
                    <Text fontSize={12.5} color="$neutral500">
                      {row.leadOrgName} verra un % agrégé, jamais le détail de mes dépenses.
                    </Text>
                  </YStack>
                  <Switch
                    value={row.membership.budget_rollup_opt_in}
                    onValueChange={(v) =>
                      toggleMembershipFlag(row.membership, 'budget_rollup_opt_in', v)
                    }
                  />
                </XStack>

                <XStack alignItems="center" justifyContent="space-between">
                  <YStack flex={1} paddingRight="$2">
                    <Text fontSize={14} fontWeight="500">
                      Ne pas apparaître dans le rapport
                    </Text>
                    <Text fontSize={12.5} color="$neutral500">
                      Masque ma ligne d&apos;attribution sur les rapports de {row.leadOrgName}.
                    </Text>
                  </YStack>
                  <Switch
                    value={row.membership.report_branding_opt_out}
                    onValueChange={(v) =>
                      toggleMembershipFlag(row.membership, 'report_branding_opt_out', v)
                    }
                  />
                </XStack>
              </YStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      {ledProjects.length > 0 && (
        <FAB icon={PlusIcon} accessibilityLabel="Inviter une entreprise" onPress={openInvite} />
      )}
      {renderSheet()}
    </YStack>
  );

  function renderSheet() {
    if (ledProjects.length === 0) {
      // Doc 02 §2.8 — only a lead org can invite. Nothing to pick a project
      // from yet (Projects itself has no real create-chantier flow shipped
      // yet either — see file header), so the invite sheet has no useful
      // target until at least one led project exists. Rather than showing
      // a broken/empty picker, the FAB itself is hidden above in that case.
      return null;
    }
    return (
      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Inviter une entreprise">
        <YStack gap="$3">
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Chantier
            </Text>
            <YStack gap="$1">
              {ledProjects.map((row) => (
                <XStack
                  key={row.project.id}
                  paddingVertical={10}
                  paddingHorizontal="$3"
                  borderRadius="$control"
                  backgroundColor={
                    selectedProjectId === row.project.id ? '$accent50' : '$neutral100'
                  }
                  onPress={() => setSelectedProjectId(row.project.id)}
                >
                  <Text
                    fontSize={14.5}
                    color={selectedProjectId === row.project.id ? '$accent600' : '$neutral900'}
                    fontWeight={selectedProjectId === row.project.id ? '600' : '400'}
                  >
                    {row.project.name}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>

          <FormField
            label="Téléphone (optionnel)"
            value={invitedPhone}
            onChangeText={setInvitedPhone}
            keyboardType="phone-pad"
          />
          <FormField
            label="E-mail (optionnel)"
            value={invitedEmail}
            onChangeText={setInvitedEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormField label="Métier (optionnel)" value={tradeType} onChangeText={setTradeType} />

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500">
              Canal d&apos;envoi
            </Text>
            <SegmentedControl
              value={sentVia}
              onChange={setSentVia}
              options={[
                { value: 'whatsapp', label: 'WhatsApp', color: '$accent600' },
                { value: 'sms', label: 'SMS', color: '$accent600' },
                { value: 'email', label: 'E-mail', color: '$accent600' },
              ]}
            />
          </YStack>

          {error && <Text color="$danger">{error}</Text>}

          <Button icon={HandshakeIcon} onPress={handleInvite} loading={saving}>
            Envoyer l&apos;invitation
          </Button>
        </YStack>
      </Sheet>
    );
  }
}
