import type { Project, SiteLog, Worker } from '@dala/shared-types';
import { useAudioPlayer } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { ImageIcon, MapPinIcon, MicrophoneIcon, NoteIcon, PlayIcon } from 'phosphor-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Image, Text, XStack, YStack } from 'tamagui';

import { EmptyState } from '@/components/ui/EmptyState';
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
 * rather than reinventing a different pattern here.
 *
 * Every photo/thumbnail/voice-note URL in the row list and the detail
 * sheet is a fresh 1-hour signed URL minted on read (getSignedUrl,
 * lib/storage.ts) — the DB only ever stores the storage path, per Doc 01
 * §1.3.11. This means a long-open list can have URLs quietly expire after
 * an hour; not solved here (a reasonable Phase-3 scope cut, called out in
 * the delivery guide) — pull-to-refresh / re-focusing the screen re-mints
 * them, same as any other screen that reloads on focus already does.
 * Playback uses expo-audio's useAudioPlayer — same caveat as
 * (worker)/update-chantier.tsx: this is a newer Expo API whose exact hook
 * signature should be double-checked against whatever version
 * `npx expo install expo-audio` resolves.
 */
export default function JournalScreen() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [logs, setLogs] = useState<SiteLog[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string | null>>({});

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailPhotoUrl, setDetailPhotoUrl] = useState<string | null>(null);
  const [detailVoiceUrl, setDetailVoiceUrl] = useState<string | null>(null);

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

  async function load() {
    setLoading(true);
    const org = await getActiveOrgId();
    if (!org) {
      setLoading(false);
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
      setSelectedProjectId((current) => current ?? list[0]!.id);
      await loadLogs(list[0]!.id);
    }
    setLoading(false);
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

  useEffect(() => {
    return () => {
      player?.remove?.();
    };
  }, [player]);

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <Text fontFamily="$display" fontSize={23} fontWeight="600" marginBottom="$4">
          Journal de chantier
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
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

        {logs.length === 0 ? (
          <Text color="$neutral500" fontSize={14} textAlign="center" marginTop="$6">
            Aucune entrée pour ce chantier.
          </Text>
        ) : (
          <YStack gap="$2">
            {logs.map((log) => (
              <XStack
                key={log.id}
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
                  <XStack alignItems="center" gap="$2">
                    <Text fontSize={12} color="$neutral500">
                      {loggedByName(log)} · {new Date(log.created_at).toLocaleDateString('fr-TN')}
                    </Text>
                    {log.location_lat != null && <MapPinIcon size={13} color="#8A8F98" />}
                  </XStack>
                </YStack>
              </XStack>
            ))}
          </YStack>
        )}
      </ScrollView>

      <Sheet visible={Boolean(detail)} onClose={() => setDetailId(null)} title="Détail">
        {detail && (
          <YStack gap="$3">
            {detailPhotoUrl && (
              <Image
                source={{ uri: detailPhotoUrl }}
                width="100%"
                height={240}
                borderRadius={16}
                resizeMode="cover"
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
    </YStack>
  );
}
