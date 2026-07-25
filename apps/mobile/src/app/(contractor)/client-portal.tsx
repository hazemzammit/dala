import type { ClientPortal, Project } from '@dala/shared-types';
import { setClientPortalPinSchema } from '@dala/validation';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { CopyIcon, HandshakeIcon, LinkIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

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
 * apps/mobile/src/app/(contractor)/client-portal.tsx
 *
 * Doc 03 §3.18 — "per-project settings screen." The brief flagged this as
 * the item to defer if time is short; it wasn't skipped, but it IS the
 * most scope-cut screen of this pass — see the caveats below and in
 * migration 0020's header (Argon2id vs bcrypt).
 *
 * A flat project list (this file's own route, no dynamic per-project
 * sub-route) with a management Sheet per project — same reasoning as
 * expenses.tsx's project-picker pattern, not a new nested route wired
 * into PlusSheet for a single settings panel.
 *
 * What's genuinely NOT in scope here, stated plainly:
 *  - The actual client-facing portal page (what a client sees when they
 *    open the generated link, PIN entry, session handling) is web/portal
 *    territory — this screen only ever writes to `client_portals` via
 *    owner/manager-gated RPCs, it never renders the client-facing view.
 *  - PIN hashing uses bcrypt (pgcrypto), not the Argon2id the spec names
 *    — see migration 0020's header for the full reasoning; this is a
 *    deliberate interim substitution, not an oversight.
 */
export default function ClientPortalScreen() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [portalsByProject, setPortalsByProject] = useState<Record<string, ClientPortal>>({});

  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [pinEnabledDraft, setPinEnabledDraft] = useState<'on' | 'off'>('off');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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

    const [{ data: projectRows }, { data: portalRows }] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('lead_org_id', org)
        .is('deleted_at', null)
        .order('name'),
      supabase.from('client_portals').select('*').eq('org_id', org),
    ]);
    setProjects((projectRows as Project[] | null) ?? []);
    const map: Record<string, ClientPortal> = {};
    ((portalRows as ClientPortal[] | null) ?? []).forEach((p) => (map[p.project_id] = p));
    setPortalsByProject(map);
    setLoading(false);
  }

  const detailProject = useMemo(
    () => projects.find((p) => p.id === detailProjectId) ?? null,
    [projects, detailProjectId],
  );
  const detailPortal = detailProjectId ? portalsByProject[detailProjectId] : undefined;

  function openDetail(project: Project) {
    setDetailProjectId(project.id);
    setPinEnabledDraft(portalsByProject[project.id]?.pin_enabled ? 'on' : 'off');
    setPin('');
    setError(null);
    setLinkCopied(false);
  }

  async function handleGenerateLink() {
    if (!detailProjectId) return;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('generate_client_portal_link', {
        p_project_id: detailProjectId,
      });
      if (rpcError) throw rpcError;
      haptics.confirm();
      await load();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Impossible de générer le lien.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink() {
    if (!detailPortal) return;
    // The client-facing portal page itself is web territory (out of
    // scope, see file header) — this constructs the URL shape the web
    // app is expected to serve, not a route that exists in this repo.
    const url = `https://app.dala.tn/portail/${detailPortal.link_token}`;
    await Clipboard.setStringAsync(url);
    setLinkCopied(true);
    haptics.confirm();
  }

  async function handleSavePin() {
    if (!detailProjectId) return;
    setError(null);

    if (pinEnabledDraft === 'off') {
      setBusy(true);
      try {
        const { error: rpcError } = await supabase.rpc('disable_client_portal_pin', {
          p_project_id: detailProjectId,
        });
        if (rpcError) throw rpcError;
        haptics.confirm();
        await load();
      } catch (e: any) {
        haptics.error();
        setError(e?.message ?? 'Impossible de désactiver le code PIN.');
      } finally {
        setBusy(false);
      }
      return;
    }

    const parsed = setClientPortalPinSchema.safeParse({ project_id: detailProjectId, pin });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Code PIN invalide.');
      haptics.error();
      return;
    }

    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('set_client_portal_pin', {
        p_project_id: parsed.data.project_id,
        p_pin: parsed.data.pin,
      });
      if (rpcError) throw rpcError;
      haptics.confirm();
      setPin('');
      await load();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Impossible de définir le code PIN.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  if (projects.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={HandshakeIcon}
          illustration="agreement"
          title="Aucun chantier"
          description="Créez d'abord un chantier pour configurer un portail client."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$1">
          Portail client
        </Text>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          Partagez un accès en lecture seule à vos clients, par chantier
        </Text>

        <YStack gap="$2">
          {projects.map((p) => {
            const portal = portalsByProject[p.id];
            return (
              <XStack
                key={p.id}
                backgroundColor="$neutral0"
                borderRadius="$card"
                padding="$4"
                justifyContent="space-between"
                alignItems="center"
                onPress={() => openDetail(p)}
              >
                <YStack flex={1}>
                  <Text fontSize={15} fontWeight="600">
                    {p.name}
                  </Text>
                  <Text fontSize={12.5} color="$neutral500">
                    {portal
                      ? portal.pin_enabled
                        ? 'Lien actif · PIN activé'
                        : 'Lien actif'
                      : 'Aucun lien généré'}
                  </Text>
                </YStack>
                {portal && <StatusBadge variant="success">Actif</StatusBadge>}
              </XStack>
            );
          })}
        </YStack>
      </ScrollView>

      <Sheet
        visible={Boolean(detailProject)}
        onClose={() => setDetailProjectId(null)}
        title={detailProject?.name ?? 'Portail'}
      >
        <YStack gap="$3">
          {detailPortal ? (
            <XStack
              alignItems="center"
              gap="$2"
              backgroundColor="$neutral25"
              borderRadius="$control"
              padding="$3"
            >
              <LinkIcon size={16} color="#8A8F98" />
              <Text fontSize={13} color="$neutral500" flex={1} numberOfLines={1}>
                {`.../portail/${detailPortal.link_token.slice(0, 10)}…`}
              </Text>
              <Button variant="text" fullWidth={false} icon={CopyIcon} onPress={handleCopyLink}>
                {linkCopied ? 'Copié' : 'Copier'}
              </Button>
            </XStack>
          ) : (
            <Text color="$neutral500" fontSize={13.5}>
              Aucun lien généré pour ce chantier.
            </Text>
          )}

          <Button variant="secondary" icon={LinkIcon} loading={busy} onPress={handleGenerateLink}>
            {detailPortal ? 'Régénérer le lien client' : 'Générer un lien client'}
          </Button>

          <YStack gap="$1.5" marginTop="$2">
            <Text fontSize={14} fontWeight="500">
              Protéger par code PIN
            </Text>
            <SegmentedControl
              value={pinEnabledDraft}
              options={[
                { value: 'on', label: 'Activé', color: '$success' },
                { value: 'off', label: 'Désactivé', color: '$neutral500' },
              ]}
              onChange={setPinEnabledDraft}
            />
          </YStack>

          {pinEnabledDraft === 'on' && (
            <FormField
              label={
                detailPortal?.pin_enabled
                  ? 'Réinitialiser le PIN du client'
                  : 'Code PIN (4 chiffres)'
              }
              value={pin}
              onChangeText={setPin}
              keyboardType="numeric"
              maxLength={4}
              placeholder="1234"
            />
          )}

          {error && <Text color="$danger">{error}</Text>}
          <Button onPress={handleSavePin} loading={busy}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}
