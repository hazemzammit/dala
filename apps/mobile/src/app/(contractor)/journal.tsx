import { color } from '@dala/design-tokens';
import type { Project, SiteLog, Worker } from '@dala/shared-types';
import { useAudioPlayer } from 'expo-audio';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  ImageIcon,
  MapPinIcon,
  MicrophoneIcon,
  NoteIcon,
  PlayIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { Image, Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonTimeline } from '@/components/ui/Skeleton';
import { getActiveOrgId } from '@/lib/activeOrg';
import { getSignedUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/journal.tsx
 *
 * Doc 03 §3.16 — reverse-chronological timeline per project, photo/voice/
 * text entries, tap for full-screen detail (caption, worker, timestamp,
 * location tag if captured).
 *
 * Per-project (a project picker at the top), same simplification
 * expenses.tsx already established for "Projects CRUD doesn't exist yet"
 * rather than reinventing a different pattern here. Phase 10 adds
 * `project/[id].tsx` (Doc 03 §3.10.2's hub); this screen now accepts an
 * optional `project_id` deep-link param from it and locks to that project
 * instead of showing its own picker — same additive pattern as
 * expenses.tsx's own Phase 10 change, not a rewrite.
 *
 * Every photo/thumbnail/voice-note URL in the row list and the detail
 * sheet is a fresh 1-hour signed URL minted on read (getSignedUrl,
 * lib/storage.ts) — the DB only ever stores the storage path, per Doc 01
 * §1.3.11. This means a long-open list can have URLs quietly expire after
 * an hour; not solved here (a reasonable Phase-3 scope cut, called out in
 * the delivery guide) — pull-to-refresh / re-focusing the screen re-mints
 * them, same as any other screen that reloads on focus already does.
 * Playback uses expo-audio's useAudioPlayer. Do NOT add a manual
 * `useEffect(() => () => player?.remove?.(), [player])` cleanup here —
 * useAudioPlayer already releases its underlying native player itself
 * whenever `detailVoiceUrl` changes or the component unmounts (it's built
 * on Expo's shared-object auto-release pattern). A prior version of this
 * file duplicated that cleanup manually, which raced with the hook's own
 * release and crashed with "Cannot use shared object that was already
 * released" every time the detail sheet closed. If future playback
 * controls need cleanup, hook into that lifecycle rather than re-adding
 * a manual `.remove()` call.
 *
 * UI/UX pass: this was the thinnest screen in the app relative to what a
 * site journal should be — a flat card list with no sense that entries are
 * sequential. Adds a connecting timeline rail (vertical line + per-entry
 * dot) down the left edge, an author `Avatar` per entry (previously text
 * only), and pull-to-refresh (the signed thumbnail/voice URLs this screen
 * mints expire after an hour per the storage note above, so refresh is
 * more than cosmetic here).
 */
export default function JournalScreen() {
  const { project_id: deepLinkProjectId } = useLocalSearchParams<{ project_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>({});

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState<string | null>(null);
  const [detailVoiceUrl, setDetailVoiceUrl] = useState<string | null>(null);
  const [fullScreenPhoto, setFullScreenPhoto] = useState(false);

  const player = useAudioPlayer(detailVoiceUrl ?? undefined);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedProjectId) void loadLogs(selectedProjectId);
    }, [selectedProjectId]),
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const org = await getActiveOrgId();
    if (!org) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const [{ data: projectRows }, { data: workerRows }] = await Promise.all([
      supabase
        .from('projects')
        .select('*')
        .eq('lead_org_id', org)
        .is('deleted_at', null)
        .order('name'),
      supabase.from('workers').select('*').eq('org_id', org),
    ]);
    const list = (projectRows as Project[] | null) ?? [];
    setProjects(list);
    setWorkers((workerRows as Worker[] | null) ?? []);
    if (list.length > 0) {
      const initial =
        deepLinkProjectId && list.some((p) => p.id === deepLinkProjectId)
          ? deepLinkProjectId
          : list[0]!.id;
      setSelectedProjectId((current) => current ?? initial);
      await loadLogs(initial);
    }
    setLoading(false);
    setRefreshing(false);
  }

  async function loadLogs(projectId: string) {
    const { data } = await supabase
      .from('site_logs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    const rows = (data as SiteLog[] | null) ?? [];
    setLogs(rows);

    const entries = await Promise.all(
      rows.map(
        async (log) => [log.id, await getSignedUrl(log.thumbnail_url ?? log.photo_url)] as const,
      ),
    );
    setThumbUrls(Object.fromEntries(entries));
  }

  const workerByUserId = useMemo(() => {
    const map: Record<string, Worker> = {};
    workers.forEach((w) => {
      if (w.user_id) map[w.user_id] = w;
    });
    return map;
  }, [workers]);

  function loggedByName(log: SiteLog): string {
    if (!log.logged_by) return 'Inconnu';
    return workerByUserId[log.logged_by]?.full_name ?? 'Contractant';
  }

  const detail = useMemo(() => logs.find((l) => l.id === detailId) ?? null, [logs, detailId]);

  async function openDetail(log: SiteLog) {
    setDetailId(log.id);
    setDetailPhotoUrl(null);
    setDetailVoiceUrl(null);
    if (log.photo_url) setDetailPhotoUrl(await getSignedUrl(log.photo_url));
    if (log.voice_note_url) setDetailVoiceUrl(await getSignedUrl(log.voice_note_url));
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonTimeline rows={4} />
      </YStack>
    );
  }

  if (projects.length === 0) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <EmptyState
          icon={ImageIcon}
          illustration="organize-photos"
          title="Aucun chantier"
          description="Créez d'abord un chantier pour voir son journal de bord."
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
        {deepLinkProjectId ? (
          <XStack alignItems="center" gap="$3" marginBottom="$4">
            <XStack
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <ArrowLeftIcon size={20} />
            </XStack>
            <Text fontFamily="$display" fontSize={23} fontWeight="600">
              Journal de chantier
            </Text>
          </XStack>
        ) : (
          <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
            Journal de chantier
          </Text>
        )}

        {!deepLinkProjectId && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
          >
            <XStack gap="$2">
              {projects.map((p) => {
                const active = p.id === selectedProjectId;
                return (
                  <XStack
                    key={p.id}
                    paddingVertical={8}
                    paddingHorizontal={14}
                    borderRadius={999}
                    backgroundColor={active ? '$accent600' : '$neutral0'}
                    borderWidth={1}
                    borderColor={active ? '$accent600' : '$neutral300'}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text fontSize={13.5} fontWeight="500" color={active ? 'white' : '$neutral900'}>
                      {p.name}
                    </Text>
                  </XStack>
                );
              })}
            </XStack>
          </ScrollView>
        )}

        {logs.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucune entrée pour ce chantier.
          </Text>
        ) : (
          <YStack position="relative">
            {/* Timeline rail — a single continuous line down the left
                edge, with a dot per entry. Was entirely absent; the
                screen's own header comment already calls this a
                "reverse-chronological timeline," but nothing visually
                connected entries before this. */}
            <YStack
              position="absolute"
              left={7}
              top={28}
              bottom={28}
              width={2}
              backgroundColor="$neutral200"
            />
            <YStack gap="$3">
              {logs.map((log) => (
                <XStack key={log.id} alignItems="flex-start" gap="$3">
                  <YStack alignItems="center" width={16} paddingTop={26} zIndex={1}>
                    <YStack
                      width={10}
                      height={10}
                      borderRadius={5}
                      backgroundColor="$accent600"
                      borderWidth={2}
                      borderColor="$neutral25"
                    />
                  </YStack>
                  <XStack
                    flex={1}
                    backgroundColor="$neutral0"
                    borderRadius="$card"
                    padding="$3"
                    alignItems="center"
                    gap="$3"
                    onPress={() => openDetail(log)}
                  >
                    {thumbUrls[log.id] ? (
                      <Image
                        source={{ uri: thumbUrls[log.id]! }}
                        width={56}
                        height={56}
                        borderRadius={12}
                      />
                    ) : (
                      <YStack
                        width={56}
                        height={56}
                        borderRadius={12}
                        backgroundColor="$neutral100"
                        alignItems="center"
                        justifyContent="center"
                      >
                        {log.voice_note_url ? (
                          <MicrophoneIcon size={22} color="#8A8F98" />
                        ) : (
                          <NoteIcon size={22} color="#8A8F98" />
                        )}
                      </YStack>
                    )}
                    <YStack flex={1} gap="$1">
                      <Text fontSize={14.5} numberOfLines={2}>
                        {log.note_text || log.caption || 'Photo de chantier'}
                      </Text>
                      <XStack alignItems="center" gap="$1.5">
                        <Avatar name={loggedByName(log)} size={16} />
                        <Text fontSize={12} color="$neutral500">
                          {loggedByName(log)} ·{' '}
                          {new Date(log.created_at).toLocaleDateString('fr-TN')}
                        </Text>
                        {log.location_lat != null && <MapPinIcon size={13} color="#8A8F98" />}
                      </XStack>
                    </YStack>
                  </XStack>
                </XStack>
              ))}
            </YStack>
          </YStack>
        )}
      </ScrollView>

      <Sheet
        visible={Boolean(detail)}
        onClose={() => {
          setDetailId(null);
          setFullScreenPhoto(false);
        }}
        title="Détail"
      >
        {detail && (
          <YStack gap="$3">
            {detailPhotoUrl && (
              <Image
                source={{ uri: detailPhotoUrl }}
                width="100%"
                height={240}
                borderRadius={16}
                resizeMode="cover"
                onPress={() => setFullScreenPhoto(true)}
                accessibilityRole="button"
                accessibilityLabel="Agrandir la photo"
              />
            )}
            {detailVoiceUrl && (
              <XStack
                alignItems="center"
                gap="$2"
                backgroundColor="$neutral25"
                borderRadius="$control"
                padding="$3"
                onPress={() => player?.play?.()}
              >
                <PlayIcon size={18} color="#111318" />
                <Text fontSize={14}>Écouter la note vocale</Text>
              </XStack>
            )}
            {detail.note_text && <Text fontSize={14.5}>{detail.note_text}</Text>}
            <YStack gap="$1">
              <Text fontSize={13} color="$neutral500">
                Ajouté par {loggedByName(detail)}
              </Text>
              <Text fontSize={13} color="$neutral500">
                {new Date(detail.created_at).toLocaleString('fr-TN')}
              </Text>
              {detail.location_lat != null && detail.location_lng != null && (
                <XStack alignItems="center" gap="$1.5">
                  <MapPinIcon size={13} color="#8A8F98" />
                  <Text fontSize={13} color="$neutral500">
                    {detail.location_lat.toFixed(5)}, {detail.location_lng.toFixed(5)}
                  </Text>
                </XStack>
              )}
            </YStack>
          </YStack>
        )}
      </Sheet>

      <ImageViewer
        visible={fullScreenPhoto}
        uri={detailPhotoUrl}
        onClose={() => setFullScreenPhoto(false)}
      />
    </YStack>
  );
}
