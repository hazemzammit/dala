import { submitSiteLogSchema } from '@dala/validation';
import { AudioModule, useAudioRecorder, useAudioRecorderState, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftIcon,
  CameraIcon,
  ImageIcon,
  MicrophoneIcon,
  StopIcon,
  TrashIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { Image, Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SkeletonHero } from '@/components/ui/Skeleton';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { processPhoto } from '@/lib/photoPipeline';
import { uploadOrgFile } from '@/lib/storage';
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
 * At least one of photo / voice note / text is required (enforced by
 * submitSiteLogSchema's `.refine`, mirrored here client-side before that
 * even runs so the error shows immediately on submit rather than after a
 * round trip).
 *
 * ** expo-audio caveat, flagged rather than glossed over **: expo-audio is
 * one of the newer Expo SDK packages (replacing expo-av's recording API)
 * and its hook surface has moved across SDK betas. The
 * useAudioRecorder/useAudioRecorderState/RecordingPresets shape below is
 * this pass's best-effort match to the currently-documented API — verify
 * it against whatever version `npx expo install expo-audio` actually
 * resolves (see package.json's note) before relying on it; if the hook
 * signature has changed, the shape to preserve is: something exposing
 * .record()/.stop()/.uri and a recording-in-progress boolean + elapsed
 * duration, which is all this screen actually needs from it.
 *
 * Location tagging (Doc 03 §3.16 "GPS-stripped location tag if captured"):
 * best-effort, silent, non-blocking — attempted only when a photo is
 * attached, never itself a reason to block "Envoyer" if permission is
 * denied (same "location is never silently required" principle as the
 * check-in flow, Doc 03 §4.1 edge cases).
 */
const MAX_RECORDING_SECONDS = 120;

export default function UpdateChantierScreen() {
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoThumbUri, setPhotoThumbUri] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  const handleStopRecording = useCallback(async () => {
    await recorder.stop();
    setRecordingUri(recorder.uri ?? null);
  }, [recorder]);

  // Auto-stop at the 2-minute cap (Doc 03 §4.2 "max 2 min").
  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis / 1000 >= MAX_RECORDING_SECONDS) {
      void handleStopRecording();
    }
  }, [handleStopRecording, recorderState.durationMillis, recorderState.isRecording]);

  async function load() {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

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
    }
  }

  async function pickPhoto(source: 'camera' | 'library') {
    setError(null);
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        source === 'camera'
          ? "Autorisez l'accès à l'appareil photo pour prendre une photo."
          : "Autorisez l'accès à vos photos pour en choisir une.",
      );
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setProcessingPhoto(true);
    try {
      // Doc 02 §2.5 — resize/compress/strip in one pass, before this file
      // ever enters the upload queue. The worker only sees a brief inline
      // spinner (processingPhoto), never a separate loading screen.
      const processed = await processPhoto(result.assets[0].uri);
      setPhotoUri(processed.uri);
      setPhotoThumbUri(processed.thumbnailUri);
    } catch {
      setError('Impossible de traiter la photo. Réessayez.');
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleStartRecording() {
    setError(null);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Autorisez l'accès au micro pour enregistrer une note vocale.");
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  function removeRecording() {
    setRecordingUri(null);
  }

  const recordingSeconds = Math.floor((recorderState.durationMillis ?? 0) / 1000);

  async function handleSubmit() {
    setError(null);

    if (!photoUri && !recordingUri && !noteText.trim()) {
      setError('Ajoutez au moins une photo, une note vocale ou un texte avant d’envoyer.');
      haptics.error();
      return;
    }
    if (!orgId || !projectId) {
      setError("Aucun chantier assigné aujourd'hui — impossible d'envoyer une mise à jour.");
      haptics.error();
      return;
    }

    const idempotencyKey = newIdempotencyKey();
    setSubmitting(true);
    try {
      let location: { lat: number; lng: number } | null = null;
      if (photoUri) {
        // Best-effort only — never blocks submission, per the file header.
        try {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (permission.granted) {
            const position = await Location.getCurrentPositionAsync({});
            location = { lat: position.coords.latitude, lng: position.coords.longitude };
          }
        } catch {
          // Silently proceed without a location tag.
        }
      }

      let photoPath: string | undefined;
      let thumbPath: string | undefined;
      if (photoUri && photoThumbUri) {
        photoPath = await uploadOrgFile(orgId, 'site-logs', photoUri, 'jpg', 'image/jpeg');
        thumbPath = await uploadOrgFile(orgId, 'site-logs', photoThumbUri, 'jpg', 'image/jpeg');
      }

      let voicePath: string | undefined;
      if (recordingUri) {
        voicePath = await uploadOrgFile(orgId, 'site-logs', recordingUri, 'm4a', 'audio/m4a');
      }

      const parsed = submitSiteLogSchema.safeParse({
        project_id: projectId,
        photo_url: photoPath,
        thumbnail_url: thumbPath,
        voice_note_url: voicePath,
        note_text: noteText.trim() || undefined,
        location_lat: location?.lat,
        location_lng: location?.lng,
        idempotency_key: idempotencyKey,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Une erreur est survenue.');
        haptics.error();
        return;
      }

      const { error: rpcError } = await supabase.rpc('submit_site_log_entry', {
        p_project_id: parsed.data.project_id,
        p_photo_url: parsed.data.photo_url ?? null,
        p_voice_note_url: parsed.data.voice_note_url ?? null,
        p_note_text: parsed.data.note_text ?? null,
        p_thumbnail_url: parsed.data.thumbnail_url ?? null,
        p_location_lat: parsed.data.location_lat ?? null,
        p_location_lng: parsed.data.location_lng ?? null,
        p_idempotency_key: parsed.data.idempotency_key,
      });
      if (rpcError) throw rpcError;

      haptics.confirm();
      setSubmitted(true);
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? "Une erreur est survenue lors de l'envoi. Réessayez.");
    } finally {
      setSubmitting(false);
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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
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

        <YStack gap="$4">
          <YStack gap="$2">
            <Text fontSize={14} fontWeight="500">
              Photo
            </Text>
            {photoThumbUri ? (
              <XStack alignItems="center" gap="$3">
                <Image source={{ uri: photoThumbUri }} width={72} height={72} borderRadius={12} />
                <Button
                  variant="secondary"
                  fullWidth={false}
                  icon={TrashIcon}
                  onPress={() => {
                    setPhotoUri(null);
                    setPhotoThumbUri(null);
                  }}
                >
                  Retirer
                </Button>
              </XStack>
            ) : (
              <XStack gap="$2">
                <Button
                  variant="secondary"
                  icon={CameraIcon}
                  loading={processingPhoto}
                  onPress={() => pickPhoto('camera')}
                >
                  Appareil photo
                </Button>
                <Button
                  variant="secondary"
                  icon={ImageIcon}
                  loading={processingPhoto}
                  onPress={() => pickPhoto('library')}
                >
                  Galerie
                </Button>
              </XStack>
            )}
          </YStack>

          <YStack gap="$2">
            <Text fontSize={14} fontWeight="500">
              Note vocale
            </Text>
            {recordingUri ? (
              <XStack alignItems="center" gap="$3">
                <Text fontSize={14} color="$neutral500">
                  Enregistrement prêt ({recordingSeconds}s)
                </Text>
                <Button
                  variant="secondary"
                  fullWidth={false}
                  icon={TrashIcon}
                  onPress={removeRecording}
                >
                  Retirer
                </Button>
              </XStack>
            ) : recorderState.isRecording ? (
              <XStack alignItems="center" gap="$3">
                <Text fontSize={14} color="$danger">
                  ● {recordingSeconds}s / {MAX_RECORDING_SECONDS}s
                </Text>
                <Button
                  variant="secondary"
                  fullWidth={false}
                  icon={StopIcon}
                  onPress={handleStopRecording}
                >
                  Arrêter
                </Button>
              </XStack>
            ) : (
              <Button variant="secondary" icon={MicrophoneIcon} onPress={handleStartRecording}>
                Enregistrer
              </Button>
            )}
          </YStack>

          <FormField
            label="Note texte (optionnel)"
            value={noteText}
            onChangeText={setNoteText}
            maxLength={500}
            multiline
            numberOfLines={4}
          />

          {error && <Text color="$danger">{error}</Text>}

          <Button onPress={handleSubmit} loading={submitting}>
            Envoyer
          </Button>
        </YStack>
      </ScrollView>
    </YStack>
  );
}
