import { color } from '@dala/design-tokens';
import type {
  OrganizationLegalForm,
  OrganizationVerificationStatus,
  Project,
  ProjectInvitation,
  ProjectMembership,
} from '@dala/shared-types';
import { inviteOrgToProjectSchema } from '@dala/validation';
import { useFocusEffect } from 'expo-router';
import { HandshakeIcon, PlusIcon, UsersThreeIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { OrgIdentityRow } from '@/components/organizations/OrgIdentityRow';
import { FAB } from '@/components/shell/FAB';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { Toggle } from '@/components/ui/Toggle';
import { getActiveOrgId } from '@/lib/activeOrg';
import { useFabBottomContentInset } from '@/lib/fabLayout';
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
interface OrgSummary {
  id: string;
  name: string;
  logoSignedUrl: string | null;
  tradeType: string | null;
  legalForm: OrganizationLegalForm | null;
  verificationStatus: OrganizationVerificationStatus | null;
  address: string | null;
  serviceArea: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  websiteUrl: string | null;
}

function fallbackOrgSummary(id: string): OrgSummary {
  return {
    id,
    name: '—',
    logoSignedUrl: null,
    tradeType: null,
    legalForm: null,
    verificationStatus: null,
    address: null,
    serviceArea: null,
    facebookUrl: null,
    instagramUrl: null,
    websiteUrl: null,
  };
}

interface LedProjectRow {
  project: Project;
  members: (ProjectMembership & { org: OrgSummary })[];
  pendingInvites: ProjectInvitation[];
}

interface TradeProjectRow {
  membership: ProjectMembership;
  project: { id?: string; name: string; client_name: string | null };
  leadOrg: OrgSummary;
}

export default function CollaborationScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fabBottomInset = useFabBottomContentInset();
  // Phase 20 (§1.7a) — captures the two independent root queries this
  // load() builds on (led projects, trade memberships); the several
  // dependent queries that follow (memberships/pending/org summaries)
  // degrade to partial data on failure rather than a broken screen, so
  // are left as-is per the scope of this pass.
  const [loadError, setLoadError] = useState(false);
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
  const [detailOrg, setDetailOrg] = useState<OrgSummary | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(false);
    const org = await getActiveOrgId();
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // --- Projects I lead -----------------------------------------------
    const { data: led, error: ledError } = await supabase
      .from('projects')
      .select('*')
      .eq('lead_org_id', org)
      .is('deleted_at', null)
      .order('name');
    if (ledError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const ledIds = (led ?? []).map((p) => p.id);

    const { data: memberships } = ledIds.length
      ? await supabase.from('project_memberships').select('*').in('project_id', ledIds)
      : { data: [] as any[] };

    const { data: pending } = ledIds.length
      ? await supabase
          .from('project_invitations')
          .select('*')
          .in('project_id', ledIds)
          .eq('status', 'pending')
      : { data: [] as ProjectInvitation[] };

    // --- Projects I'm a trade participant on ----------------------------
    const { data: tradeMemberships, error: tradeError } = await supabase
      .from('project_memberships')
      .select('*')
      .eq('org_id', org)
      .eq('role', 'trade');
    if (tradeError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const tradeProjectIds = (tradeMemberships ?? []).map((m) => m.project_id);
    const { data: tradeProjectRows } = tradeProjectIds.length
      ? await supabase
          .from('projects')
          .select('id, name, client_name, lead_org_id')
          .in('id', tradeProjectIds)
      : { data: [] as any[] };

    // Both lists need another org's identity — a fellow trade/client org
    // for "Mes chantiers partagés," the lead org for "Chantiers auxquels
    // je participe." Neither can be read via a plain client-side
    // `organizations` select or embed: organizations_select_member (0005)
    // only covers same-org membership, with no carve-out for "shares a
    // project with me" — see migration 0078's own header for the full
    // reasoning and the bug this replaces. One batched RPC call covers
    // every org needed across both lists.
    const neededOrgIds = [
      ...new Set([
        ...(memberships ?? []).map((m: any) => m.org_id as string),
        ...(tradeProjectRows ?? []).map((p: any) => p.lead_org_id as string),
      ]),
    ];
    const { data: orgSummaries } = neededOrgIds.length
      ? await supabase.rpc('get_shared_project_org_summaries', { p_org_ids: neededOrgIds })
      : { data: [] as any[] };
    const orgById = new Map<string, OrgSummary>(
      (orgSummaries ?? []).map((o: any) => [
        o.id,
        {
          id: o.id,
          name: o.name,
          logoSignedUrl: o.logo_signed_url,
          tradeType: o.trade_type,
          legalForm: o.legal_form,
          verificationStatus: o.verification_status,
          address: o.address,
          serviceArea: o.service_area,
          facebookUrl: o.facebook_url,
          instagramUrl: o.instagram_url,
          websiteUrl: o.website_url,
        },
      ]),
    );

    const ledRows: LedProjectRow[] = (led ?? []).map((project) => ({
      project,
      members: (memberships ?? [])
        .filter((m: any) => m.project_id === project.id)
        .map((m: any) => ({ ...m, org: orgById.get(m.org_id) ?? fallbackOrgSummary(m.org_id) })),
      pendingInvites: (pending ?? []).filter((i) => i.project_id === project.id),
    }));
    setLedProjects(ledRows);

    const tradeRows: TradeProjectRow[] = (tradeMemberships ?? []).map((membership) => {
      const project = (tradeProjectRows ?? []).find((p: any) => p.id === membership.project_id);
      return {
        membership,
        project: {
          id: project?.id,
          name: project?.name ?? '—',
          client_name: project?.client_name ?? null,
        },
        leadOrg: project?.lead_org_id
          ? (orgById.get(project.lead_org_id) ?? fallbackOrgSummary(project.lead_org_id))
          : fallbackOrgSummary(''),
      };
    });
    setTradeProjects(tradeRows);

    setLoading(false);
    setRefreshing(false);
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
      const { data: invitationId, error: rpcError } = await supabase.rpc('invite_org_to_project', {
        p_project_id: parsed.data.project_id,
        p_invited_phone: parsed.data.invited_phone ?? null,
        p_invited_email: parsed.data.invited_email ?? null,
        p_trade_type: parsed.data.trade_type ?? null,
        p_sent_via: parsed.data.sent_via,
      });
      if (rpcError) throw rpcError;

      // Division of labor unchanged for whatsapp/sms (still a
      // notification-dispatch gap, still no provider decided — identical
      // scope boundary to team.tsx's own worker-invite flow). For email,
      // this phase closes the gap: send-project-invitation-email actually
      // delivers the `dala://accept-org-invite?token=...` link via Resend,
      // same pattern as team-members.tsx's own org-member invite call.
      // Non-fatal if it fails — the invitation row already exists and is
      // valid; only the notification attempt failed.
      let emailWarning: string | null = null;
      if (parsed.data.sent_via === 'email' && invitationId) {
        const { data: fnData, error: fnError } = await supabase.functions.invoke(
          'send-project-invitation-email',
          { body: { invitation_id: invitationId } },
        );
        if (fnError || !fnData?.success) {
          emailWarning = "L'invitation a été créée, mais l'e-mail n'a pas pu être envoyé.";
        }
      }

      haptics.confirm();
      setSheetOpen(false);
      if (emailWarning) {
        toast.info(emailWarning);
      } else {
        toast.success('Invitation envoyée.');
      }
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
      toast.error('Impossible de mettre à jour ce réglage.');
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

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
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
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: fabBottomInset }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
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
                      <YStack flex={1}>
                        <OrgIdentityRow
                          name={m.org.name}
                          logoSignedUrl={m.org.logoSignedUrl}
                          tradeType={m.org.tradeType}
                          legalForm={m.org.legalForm}
                          verificationStatus={m.org.verificationStatus}
                          size="compact"
                          onPress={() => setDetailOrg(m.org)}
                        />
                      </YStack>
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
                <YStack gap="$1.5">
                  <Text fontSize={15.5} fontWeight="600">
                    {row.project.name}
                  </Text>
                  <OrgIdentityRow
                    name={row.leadOrg.name}
                    logoSignedUrl={row.leadOrg.logoSignedUrl}
                    tradeType={row.leadOrg.tradeType}
                    legalForm={row.leadOrg.legalForm}
                    verificationStatus={row.leadOrg.verificationStatus}
                    size="compact"
                    onPress={() => setDetailOrg(row.leadOrg)}
                  />
                </YStack>

                <XStack alignItems="center" justifyContent="space-between">
                  <YStack flex={1} paddingEnd="$2">
                    <Text fontSize={14} fontWeight="500">
                      Partager mon budget consommé
                    </Text>
                    <Text fontSize={12.5} color="$neutral500">
                      {row.leadOrg.name} verra un % agrégé, jamais le détail de mes dépenses.
                    </Text>
                  </YStack>
                  <Toggle
                    value={row.membership.budget_rollup_opt_in}
                    onChange={(v) =>
                      toggleMembershipFlag(row.membership, 'budget_rollup_opt_in', v)
                    }
                    accessibilityLabel="Partager mon budget consommé"
                  />
                </XStack>

                <XStack alignItems="center" justifyContent="space-between">
                  <YStack flex={1} paddingEnd="$2">
                    <Text fontSize={14} fontWeight="500">
                      Ne pas apparaître dans le rapport
                    </Text>
                    <Text fontSize={12.5} color="$neutral500">
                      Masque ma ligne d&apos;attribution sur les rapports de {row.leadOrg.name}.
                    </Text>
                  </YStack>
                  <Toggle
                    value={row.membership.report_branding_opt_out}
                    onChange={(v) =>
                      toggleMembershipFlag(row.membership, 'report_branding_opt_out', v)
                    }
                    accessibilityLabel="Ne pas apparaître dans le rapport"
                  />
                </XStack>
              </YStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      {/* Org-creation-guide follow-on — read-only detail sheet, opened by
          tapping either list's OrgIdentityRow. Everything shown here comes
          from get_shared_project_org_summaries (migration 0078; socials
          added in 0082) — the same safe, non-sensitive "public profile"
          slice a client-facing view would show, never matricule_fiscal/
          rc_number/RIB. */}
      <Sheet visible={!!detailOrg} onClose={() => setDetailOrg(null)} title={detailOrg?.name ?? ''}>
        {detailOrg && (
          <YStack gap="$3" padding="$4">
            <OrgIdentityRow
              name={detailOrg.name}
              logoSignedUrl={detailOrg.logoSignedUrl}
              tradeType={detailOrg.tradeType}
              legalForm={detailOrg.legalForm}
              verificationStatus={detailOrg.verificationStatus}
              size="default"
            />
            {detailOrg.serviceArea && (
              <YStack>
                <Text fontSize={12.5} color="$neutral500">
                  Zone d&apos;intervention
                </Text>
                <Text fontSize={14.5}>{detailOrg.serviceArea}</Text>
              </YStack>
            )}
            {detailOrg.address && (
              <YStack>
                <Text fontSize={12.5} color="$neutral500">
                  Adresse
                </Text>
                <Text fontSize={14.5}>{detailOrg.address}</Text>
              </YStack>
            )}
            {(detailOrg.facebookUrl || detailOrg.instagramUrl || detailOrg.websiteUrl) && (
              <YStack gap="$1.5">
                <Text fontSize={12.5} color="$neutral500">
                  Liens
                </Text>
                {detailOrg.websiteUrl && (
                  <Text
                    fontSize={14.5}
                    color="$accent600"
                    onPress={() => Linking.openURL(detailOrg.websiteUrl!)}
                  >
                    Site web
                  </Text>
                )}
                {detailOrg.facebookUrl && (
                  <Text
                    fontSize={14.5}
                    color="$accent600"
                    onPress={() => Linking.openURL(detailOrg.facebookUrl!)}
                  >
                    Facebook
                  </Text>
                )}
                {detailOrg.instagramUrl && (
                  <Text
                    fontSize={14.5}
                    color="$accent600"
                    onPress={() => Linking.openURL(detailOrg.instagramUrl!)}
                  >
                    Instagram
                  </Text>
                )}
              </YStack>
            )}
          </YStack>
        )}
      </Sheet>

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
