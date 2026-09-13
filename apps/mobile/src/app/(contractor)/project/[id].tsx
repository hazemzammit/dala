import type { Project } from '@dala/shared-types';
import { PROJECT_TYPES } from '@dala/validation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  CaretRightIcon,
  ClipboardTextIcon,
  CoinsIcon,
  NoteIcon,
  ShieldIcon,
  TruckIcon,
  UsersIcon,
} from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Image, Text, XStack, YStack } from 'tamagui';

import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActiveOrgId } from '@/lib/activeOrg';
import { getSignedUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useTokenColor } from '@/lib/useTokenColor';

/**
 * apps/mobile/src/app/(contractor)/project/[id].tsx
 *
 * Doc 03 §3.10.2 "Project detail" — the tab-bar hub every phase since
 * Phase 7 deferred (see projects.tsx's own header for the prior
 * lightweight-sheet stand-in this replaces as the primary entry point).
 *
 * Phase 10 scope, stated plainly:
 *   - Tab bar per spec is Aperçu / Dispatch / Dépenses / Matériaux /
 *     Journal / Sécurité / Équipe (7 items). Only THREE are wired as real
 *     pre-filtered tabs here: Aperçu (inline, new — no existing standalone
 *     screen), Dépenses, Journal (both deep-link to their existing
 *     screens with ?project_id=, which they now honor — see their own
 *     Phase 10 header notes). Dispatch/Matériaux/Sécurité are listed
 *     below as plain "Autres modules" links — honestly unfiltered,
 *     landing on each screen's own project picker, exactly like the old
 *     sheet did. Équipe isn't linked at all: team.tsx is the org's whole
 *     worker roster, not project-scoped, and turning it into one is a
 *     real design question (which workers are "this project's team"? —
 *     dispatch assignments? a new membership concept?) that Doc 03 §3.10.2
 *     doesn't answer, so it isn't invented here.
 *   - No progress ring — see projects.tsx's header for why (no
 *     milestones/tasks data model exists; explicitly still BLOCKED).
 *   - No budget-consumed bar in the header either — that number already
 *     lives on the Dépenses tab (and the Projects list card); duplicating
 *     it here would mean keeping two computations in sync for no real
 *     benefit.
 *   - Private-layer tab visibility (Doc 02 §2.8): Dépenses is itemized
 *     financial data — Private layer, lead-org-only — so it's simply
 *     absent from the tab row for a trade-participant org, not
 *     shown-then-blocked. Aperçu and Journal are treated as visible to
 *     any project member (lead or trade): Doc 02 §2.8's table only gives
 *     Task list / Comment thread as worked Shared-layer examples, but
 *     site-log entries (photos/notes/voice) read the same way — shared
 *     progress documentation, not itemized financial data — so that's
 *     the reasonable reading, not a literal spec line. Flagging this
 *     interpretation rather than presenting it as spec-confirmed.
 *
 * Phase 11 — Dispatch tab (Doc 03 §3.10.2, §3.11): promoted out of
 * "Autres modules" into a real pre-filtered tab, `dispatch.tsx?project_id=`.
 * Visible to lead AND trade-participant orgs — same Shared-layer reasoning
 * as Journal above (not itemized financial/payroll data; each org only
 * ever sees its own dispatch rows regardless, per dispatch.tsx's own RLS
 * note), flagged as the same kind of interpretation, not a literal spec
 * line. Matériaux/Sécurité stay in "Autres modules": both have their own
 * file-header comments stating they're deliberately org-wide by an
 * earlier phase's design decision, which folding them into per-project
 * tabs would reverse — not done here without that decision being revisited
 * explicitly.
 *
 * Phase 12 — Équipe tab (Doc 03 §3.10.2): migration 0034's schema now has a
 * real screen (`project-roster.tsx?project_id=`, deliberately not named
 * `team.tsx` — see that file's own header for why the org-wide roster and
 * the per-project staffing roster are two different tables/questions).
 * Same visibility call as Dispatch — lead AND trade-participant orgs, each
 * org seeing only its own roster rows (`project_workers_select_member` is
 * `is_org_member(org_id)`, unrelated to project participation) — flagged as
 * the same kind of interpretation, not spec-confirmed. No archived/
 * completed read-only lock, unlike Dispatch's: see project-roster.tsx's own
 * header for why that wasn't assumed.
 */
export default function ProjectHubScreen() {
  // Doc 05 §1.7k migration — Phase 19A: replaces the 10 untokenized
  // `#8A8F98` icon colors below with the theme-aware neutral-400 token
  // (Phase 17 audit logged 12 occurrences; recount here found 10 —
  // noted, not re-audited).
  const tc = useTokenColor();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — distinguishes "the fetch failed" from "this
  // project genuinely doesn't exist," which previously both rendered
  // the same "Chantier introuvable" text — misleading on a real fetch
  // failure, since the project may well still exist.
  const [loadError, setLoadError] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [isLead, setIsLead] = useState(false);
  const [leadOrgName, setLeadOrgName] = useState<string | null>(null);
  // Bug fix: this screen fetched `project.cover_photo_url` via its own
  // `select('*')` all along but never rendered it anywhere — a real gap,
  // not a design choice (Chantiers' list card and the dashboard carousel
  // both show it; the detail page silently didn't).
  const [coverSignedUrl, setCoverSignedUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [id]),
  );

  async function load() {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    const activeOrgId = await getActiveOrgId();

    // RLS (projects_select_lead_or_trade, 0006) already scopes this to
    // "lead OR trade-participant on this project" — no need to branch the
    // query by role, a trade org simply gets the same row a lead org would.
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
    if (error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    if (!data) {
      setLoading(false);
      return;
    }
    setProject(data as Project);
    setCoverSignedUrl(data.cover_photo_url ? await getSignedUrl(data.cover_photo_url) : null);

    const lead = activeOrgId != null && data.lead_org_id === activeOrgId;
    setIsLead(lead);

    if (!lead) {
      const { data: leadOrg } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', data.lead_org_id)
        .maybeSingle();
      setLeadOrgName(leadOrg?.name ?? null);
    } else {
      setLeadOrgName(null);
    }

    setLoading(false);
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

  if (!project) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" paddingHorizontal="$4">
        <XStack alignItems="center" gap="$3" marginTop="$4" marginBottom="$4">
          <XStack
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <ArrowLeftIcon size={20} />
          </XStack>
          <Text fontSize={16} fontWeight="600">
            Chantier introuvable
          </Text>
        </XStack>
      </YStack>
    );
  }

  const typeLabel = PROJECT_TYPE_LABELS[project.project_type as (typeof PROJECT_TYPES)[number]];
  const otherModules = [
    { href: '/materials', label: 'Matériaux', icon: ClipboardTextIcon },
    { href: '/safety', label: 'Sécurité', icon: ShieldIcon },
  ] as const;

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
        {coverSignedUrl && (
          <Image
            src={coverSignedUrl}
            width="100%"
            height={160}
            borderRadius={12}
            marginBottom="$4"
          />
        )}
        <XStack alignItems="center" gap="$3" marginBottom="$4">
          <XStack
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
          >
            <ArrowLeftIcon size={20} />
          </XStack>
          <YStack flex={1}>
            <Text fontFamily="$display" fontSize={20} fontWeight="600" numberOfLines={1}>
              {project.name}
            </Text>
            {project.client_name && (
              <Text fontSize={13} color="$neutral500">
                {project.client_name}
              </Text>
            )}
          </YStack>
        </XStack>

        <XStack gap="$2" flexWrap="wrap" marginBottom="$4">
          <StatusBadge
            variant={
              project.status === 'active'
                ? 'success'
                : project.status === 'completed'
                  ? 'neutral'
                  : 'warning'
            }
          >
            {project.status === 'active'
              ? 'Actif'
              : project.status === 'completed'
                ? 'Terminé'
                : 'Archivé'}
          </StatusBadge>
          {!isLead && leadOrgName && <StatusBadge variant="info">{leadOrgName}</StatusBadge>}
          {typeLabel && <StatusBadge variant="neutral">{typeLabel}</StatusBadge>}
        </XStack>

        {project.address && (
          <Text fontSize={14} color="$neutral500" marginBottom="$5">
            {project.address}
          </Text>
        )}

        {/* Dépenses tab — Private layer (Doc 02 §2.8), lead-org-only. */}
        <YStack gap="$2" marginBottom="$5">
          <Text fontSize={13} fontWeight="600" color="$neutral500">
            MODULES
          </Text>

          {isLead && (
            <XStack
              backgroundColor="$neutral0"
              borderRadius="$card"
              padding="$4"
              alignItems="center"
              gap="$3"
              onPress={() => router.push(`/expenses?project_id=${project.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel="Dépenses"
            >
              <CoinsIcon size={20} color={tc.neutral400} />
              <Text flex={1} fontSize={15} fontWeight="500">
                Dépenses
              </Text>
              <CaretRightIcon size={16} color={tc.neutral400} />
            </XStack>
          )}

          <XStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            alignItems="center"
            gap="$3"
            onPress={() => router.push(`/dispatch?project_id=${project.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel="Dispatch"
          >
            <TruckIcon size={20} color={tc.neutral400} />
            <Text flex={1} fontSize={15} fontWeight="500">
              Dispatch
            </Text>
            <CaretRightIcon size={16} color={tc.neutral400} />
          </XStack>

          <XStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            alignItems="center"
            gap="$3"
            onPress={() => router.push(`/journal?project_id=${project.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel="Journal de chantier"
          >
            <NoteIcon size={20} color={tc.neutral400} />
            <Text flex={1} fontSize={15} fontWeight="500">
              Journal de chantier
            </Text>
            <CaretRightIcon size={16} color={tc.neutral400} />
          </XStack>

          <XStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            alignItems="center"
            gap="$3"
            onPress={() => router.push(`/project-roster?project_id=${project.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel="Équipe"
          >
            <UsersIcon size={20} color={tc.neutral400} />
            <Text flex={1} fontSize={15} fontWeight="500">
              Équipe
            </Text>
            <CaretRightIcon size={16} color={tc.neutral400} />
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontSize={13} fontWeight="600" color="$neutral500">
            AUTRES MODULES
          </Text>
          <Text fontSize={12} color="$neutral400" marginBottom="$1">
            Pas encore pré-filtrés pour ce chantier — vous choisirez le chantier sur l&apos;écran
            suivant.
          </Text>
          {otherModules.map((m) => (
            <XStack
              key={m.href}
              backgroundColor="$neutral0"
              borderRadius="$card"
              padding="$4"
              alignItems="center"
              gap="$3"
              onPress={() => router.push(m.href as never)}
              accessibilityRole="button"
              accessibilityLabel={m.label}
            >
              <m.icon size={20} color={tc.neutral400} />
              <Text flex={1} fontSize={15} fontWeight="500">
                {m.label}
              </Text>
              <CaretRightIcon size={16} color={tc.neutral400} />
            </XStack>
          ))}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

const PROJECT_TYPE_LABELS: Record<(typeof PROJECT_TYPES)[number], string> = {
  residentiel: 'Résidentiel',
  commercial: 'Commercial',
  industriel: 'Industriel',
  renovation: 'Rénovation',
  infrastructure: 'Infrastructure',
  autre: 'Autre',
};
