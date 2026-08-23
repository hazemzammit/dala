import { color } from '@dala/design-tokens';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { SiteLogForm } from '@/components/journal/SiteLogForm';
import { Button } from '@/components/ui/Button';
import { SkeletonHero } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';

// cspell:disable

/**
 * apps/mobile/src/app/(worker)/update-chantier.tsx
 *
 * Doc 03 §4.2 — new route, didn't exist before this pass; (worker)/home.tsx's
 * state-machine third state ("Envoyer un update") previously showed a
 * "coming soon" alert placeholder (see that file's old `handleUpdate`
 * comment) — this replaces it.
 *
 * IMPROVEMENT-PLAN PHASE 2 (§1.2 step 1) — this file's entire form body
 * (photo/voice/text inputs, upload pipeline, local-first write) moved to
 * the new `components/journal/SiteLogForm.tsx`, reused by the contractor's
 * new add-entry FAB on `(contractor)/journal.tsx`. What stays HERE,
 * unchanged from before this phase:
 *
 *   - `load()` — resolving the current session, the worker's own `org_id`,
 *     and today's dispatch-assigned project. This is worker-specific
 *     (a contractor has no "today's assignment" concept), so it did not
 *     move into the shared component.
 *   - The post-submit full-screen confirmation ("Mise à jour envoyée").
 *     The contractor's equivalent (journal.tsx) closes a Sheet and shows a
 *     toast instead — different enough chrome per caller that keeping it
 *     out of the shared form was the right cut, not an oversight.
 *   - Pull-to-refresh on the assignment lookup, the back button, the
 *     "Pour {projectName}" subtitle.
 *
 * PHASE 19 — SCOPE DECISION, disclosed rather than silently drawn (still
 * true after this phase's extraction, since it's about the upload calls
 * `SiteLogForm` makes, not this page's own logic): photo/voice uploads
 * still require connectivity — you cannot upload bytes to Supabase Storage
 * while offline, full stop. A genuinely offline-capable media flow needs a
 * dedicated local upload queue (persist the local file, retry the actual
 * upload on reconnect, PATCH the site_logs row's photo_url/voice_note_url
 * once it succeeds) — that's real, separate engineering (Doc 03 §4.2's
 * "upload queue" phrase is describing exactly this), not something folded
 * into either this screen or `SiteLogForm`. A TEXT-ONLY update (no photo/
 * voice) genuinely works with zero connectivity, since it has no upload
 * step at all.
 */
export default function UpdateChantierScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      setUserId(session.user.id);

      const { data: worker } = await supabase
        .from('workers')
        .select('id, org_id')
        .eq('user_id', session.user.id)
        .single();
      if (!worker) return;

      setOrgId(worker.org_id);

      const today = new Date().toISOString().slice(0, 10);
      const { data: assignment } = await supabase
        .from('dispatch_assignments')
        .select('project_id, projects(name)')
        .eq('worker_id', worker.id)
        .eq('assignment_date', today)
        .maybeSingle();

      setProjectId(assignment?.project_id ?? null);
      setProjectName((assignment as any)?.projects?.name ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonHero />
      </YStack>
    );
  }

  if (submitted) {
    return (
      <YStack
        flex={1}
        backgroundColor="$neutral25"
        alignItems="center"
        justifyContent="center"
        padding="$4"
      >
        <Text
          fontFamily="$display"
          fontSize={20}
          fontWeight="600"
          textAlign="center"
          marginBottom="$2"
        >
          Mise à jour envoyée
        </Text>
        <Text color="$neutral500" fontSize={14} textAlign="center" marginBottom="$4">
          Votre responsable la verra sur le journal de chantier.
        </Text>
        <Button fullWidth={false} onPress={() => router.back()}>
          Retour
        </Button>
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
        <XStack alignItems="center" gap="$2" marginBottom="$4" onPress={() => router.back()}>
          <ArrowLeftIcon size={20} />
          <Text fontSize={15} color="$neutral500">
            Retour
          </Text>
        </XStack>

        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$1">
          Envoyer un update
        </Text>
        <Text color="$neutral500" fontSize={13} marginBottom="$4">
          {projectName ? `Pour ${projectName}` : "Aucun chantier assigné aujourd'hui"}
        </Text>

        {orgId && projectId && userId ? (
          <SiteLogForm
            orgId={orgId}
            projectId={projectId}
            userId={userId}
            onSubmitted={() => setSubmitted(true)}
          />
        ) : (
          <Text color="$danger">
            Aucun chantier assigné aujourd'hui — impossible d'envoyer une mise à jour.
          </Text>
        )}
      </ScrollView>
    </YStack>
  );
}
