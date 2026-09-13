import { color } from '@dala/design-tokens';
import type { ClientPortal, Project } from '@dala/shared-types';
import { setClientPortalPinSchema } from '@dala/validation';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  CopyIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  HandshakeIcon,
  LinkIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { ListCard } from '@/components/ui/ListCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

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
 *  - PIN hashing uses bcrypt (pgcrypto), not the Argon2id the spec names
 *    — see migration 0020's header for the full reasoning; this is a
 *    deliberate interim substitution, not an oversight.
 *
 * IMPROVEMENT-PLAN PHASE 9 (§2.5 "Client-facing invoicing"): the note that
 * used to sit here ("the actual client-facing portal page... is web/
 * portal territory") is now stale in one important way — that page now
 * EXISTS (apps/web/src/app/portail/[token]/page.tsx, this phase; see
 * migration 0074's Part 2 header for the fuller Step 1 finding this
 * closes). This screen's own scope is unchanged — it still only ever
 * writes to `client_portals`/`invoices` via owner/manager-gated RPCs, it
 * still never renders the client-facing view itself — but "generate an
 * invoice" is now a real action here: `create_invoice()` snapshots
 * `project_expenses` for a chosen period, and the resulting PDF (fetched
 * via `generate-invoice-pdf`, same authenticated-org-member path
 * generate-report already established) can be shared the same way
 * reports.tsx shares a PDF (native share sheet, `expo-file-system`'s
 * SDK 54 `File`/`Paths` API — see that file's own header for why this
 * app doesn't use the legacy functional API for binary writes).
 */
interface Invoice {
  id: string;
  invoice_number: string;
  issued_at: string;
  due_date: string;
  subtotal: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function ClientPortalScreen() {
  const toast = useToast();
  const tc = useTokenColor();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [portalsByProject, setPortalsByProject] = useState<Record<string, ClientPortal>>({});

  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [pinEnabledDraft, setPinEnabledDraft] = useState<'on' | 'off'>('off');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Phase 20 (§1.7a) — separate from `error` above, which is scoped to
  // the pin/invoice sheet flow. This one distinguishes "the primary list
  // fetch failed" from "there are genuinely no chantiers yet," which
  // previously rendered identically (both fell through to the
  // `projects.length === 0` EmptyState branch below).
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Phase 9 §2.5 — invoicing state, scoped to whichever project's Sheet
  // is currently open (mirrors detailPortal's own "only meaningful while
  // a detail Sheet is open" shape, not a global list).
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [periodFrom, setPeriodFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return isoDate(d);
  });
  const [periodTo, setPeriodTo] = useState(() => isoDate(new Date()));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return isoDate(d);
  });
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

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

    const [{ data: projectRows, error: projectsError }, { data: portalRows, error: portalsError }] =
      await Promise.all([
        supabase
          .from('projects')
          .select('*')
          .eq('lead_org_id', org)
          .is('deleted_at', null)
          .order('name'),
        supabase.from('client_portals').select('*').eq('org_id', org),
      ]);
    if (projectsError || portalsError) {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setProjects((projectRows as Project[] | null) ?? []);
    const map: Record<string, ClientPortal> = {};
    ((portalRows as ClientPortal[] | null) ?? []).forEach((p) => (map[p.project_id] = p));
    setPortalsByProject(map);
    setLoading(false);
    setRefreshing(false);
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
    setInvoiceFormOpen(false);
    void loadInvoices(project.id);
  }

  async function loadInvoices(projectId: string) {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, issued_at, due_date, subtotal')
      .eq('project_id', projectId)
      .order('issued_at', { ascending: false });
    setInvoices((data as Invoice[] | null) ?? []);
  }

  async function handleGenerateInvoice() {
    if (!detailProjectId) return;
    setInvoiceBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc('create_invoice', {
        p_project_id: detailProjectId,
        p_period_from: periodFrom,
        p_period_to: periodTo,
        p_due_date: dueDate,
      });
      if (rpcError) throw rpcError;
      haptics.confirm();
      toast.success('Facture générée.');
      setInvoiceFormOpen(false);
      await loadInvoices(detailProjectId);
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? 'Impossible de générer la facture.');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function handleDownloadInvoice(invoiceId: string) {
    setDownloadingInvoiceId(invoiceId);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session invalide.');

      // Same explicit-fetch-not-invoke() reasoning as reports.tsx's own
      // header — a binary application/pdf body, not the json/text shape
      // supabase.functions.invoke() auto-detects around.
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-invoice-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ invoice_id: invoiceId }),
        },
      );
      if (!response.ok) throw new Error('Impossible de générer le PDF.');

      const buffer = await response.arrayBuffer();
      const file = new File(Paths.cache, `facture-${invoiceId}.pdf`);
      file.create({ overwrite: true });
      file.write(new Uint8Array(buffer));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
      } else {
        toast.success(`Fichier enregistré : ${file.uri}`);
      }
    } catch (e: any) {
      haptics.error();
      toast.error(e?.message ?? 'Impossible de télécharger la facture.');
    } finally {
      setDownloadingInvoiceId(null);
    }
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
      toast.success('Lien généré.');
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
        toast.success('Code PIN désactivé.');
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
      toast.success('Code PIN défini.');
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

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
      </YStack>
    );
  }

  if (projects.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={HandshakeIcon}
          illustration="handshake-deal"
          title="Aucun chantier"
          description="Créez d'abord un chantier pour configurer un portail client."
        />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={color.accent[600]}
          />
        }
      >
        <XStack alignItems="center" gap="$2" marginBottom="$1">
          <Icon3D name="link-chain" size={40} />
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Portail client
          </Text>
        </XStack>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          Partagez un accès en lecture seule à vos clients, par chantier
        </Text>

        <YStack gap="$2">
          {/* UI/UX pass — composes the shared `ListCard`. Icon chip tints
              green (active-portal `success`) when a link exists, neutral
              otherwise — status visible before reading the badge/subtitle
              text, same principle as the other reworked screens. */}
          {projects.map((p) => {
            const portal = portalsByProject[p.id];
            return (
              <ListCard
                key={p.id}
                icon={LinkIcon}
                iconTint={portal ? tc.success : tc.neutral500}
                title={p.name}
                subtitle={
                  portal
                    ? portal.pin_enabled
                      ? 'Lien actif · PIN activé'
                      : 'Lien actif'
                    : 'Aucun lien généré'
                }
                onPress={() => openDetail(p)}
                badge={portal && <StatusBadge variant="success">Actif</StatusBadge>}
              />
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

          {/* PHASE 9 §2.5 — invoicing, deliberately its own section below
              the PIN form rather than a separate Sheet: both belong to
              "this project's client portal," and this screen already
              uses one Sheet per project for the PIN half, so a second
              nested Sheet for invoicing would be an inconsistent second
              interaction pattern for the same conceptual object. */}
          <YStack
            gap="$2"
            marginTop="$4"
            borderTopWidth={1}
            borderTopColor="$neutral100"
            paddingTop="$4"
          >
            <Text fontSize={14} fontWeight="500">
              Factures
            </Text>

            {invoices.length > 0 && (
              <YStack gap="$2">
                {invoices.map((inv) => (
                  <XStack
                    key={inv.id}
                    alignItems="center"
                    justifyContent="space-between"
                    backgroundColor="$neutral25"
                    borderRadius="$control"
                    padding="$3"
                  >
                    <YStack flex={1}>
                      <Text fontSize={13.5} fontWeight="600">
                        {inv.invoice_number}
                      </Text>
                      <Text fontSize={12} color="$neutral500">
                        {Number(inv.subtotal).toFixed(2)} TND · échéance {inv.due_date}
                      </Text>
                    </YStack>
                    <XStack
                      onPress={() => handleDownloadInvoice(inv.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Télécharger ${inv.invoice_number}`}
                    >
                      {downloadingInvoiceId === inv.id ? (
                        <Text fontSize={12} color="$neutral500">
                          …
                        </Text>
                      ) : (
                        <DownloadSimpleIcon size={18} color="#0F9D8E" />
                      )}
                    </XStack>
                  </XStack>
                ))}
              </YStack>
            )}

            {!invoiceFormOpen ? (
              <Button
                variant="secondary"
                icon={FileTextIcon}
                onPress={() => setInvoiceFormOpen(true)}
              >
                Générer une facture
              </Button>
            ) : (
              <YStack gap="$3" backgroundColor="$neutral25" borderRadius="$control" padding="$3">
                <DatePicker
                  label="Période — du"
                  value={periodFrom}
                  onChange={setPeriodFrom}
                  maximumDate={new Date(periodTo)}
                />
                <DatePicker
                  label="Période — au"
                  value={periodTo}
                  onChange={setPeriodTo}
                  minimumDate={new Date(periodFrom)}
                  maximumDate={new Date()}
                />
                <DatePicker label="Date d'échéance" value={dueDate} onChange={setDueDate} />
                <Button onPress={handleGenerateInvoice} loading={invoiceBusy}>
                  Générer
                </Button>
              </YStack>
            )}
          </YStack>
        </YStack>
      </Sheet>
    </YStack>
  );
}
