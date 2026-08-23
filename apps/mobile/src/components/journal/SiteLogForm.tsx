import { submitSiteLogSchema } from '@dala/validation';
import { AudioModule, useAudioRecorder, useAudioRecorderState, RecordingPresets } from 'expo-audio';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { CameraIcon, ImageIcon, MicrophoneIcon, StopIcon, TrashIcon } from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { database } from '@/db';
import { createWithClientId } from '@/db/createWithClientId';
import SiteLog from '@/db/models/SiteLog';
import { runSync } from '@/db/sync';
import { haptics } from '@/lib/haptics';
import { newIdempotencyKey } from '@/lib/idempotency';
import { processPhoto } from '@/lib/photoPipeline';
import { uploadOrgFile } from '@/lib/storage';

/**
 * apps/mobile/src/components/journal/SiteLogForm.tsx
 *
 * IMPROVEMENT-PLAN PHASE 2 (§1.2 step 1) — extracted from
 * `(worker)/update-chantier.tsx`, which was that screen's entire body
 * before this phase. Every field, comment-documented behavior, and edge
 * case below is UNCHANGED from that file — same photo/voice/text inputs,
 * same `processPhoto`/`uploadOrgFile` pipeline, same best-effort silent
 * location tagging, same `submitSiteLogSchema` validation, same local-first
 * `createWithClientId` + fire-and-forget `runSync()` write. Only the page
 * chrome around it (header, back button, project-resolution `load()`, the
 * post-submit full-screen confirmation) stayed behind in each caller —
 * this component is the FORM itself, reusable wherever "who's submitting"
 * and "which project" are already known:
 *
 *   - `(worker)/update-chantier.tsx` — worker's own update, `userId` is
 *     their own auth id, `projectId` comes from today's dispatch
 *     assignment. Behavior identical to before this extraction.
 *   - `(contractor)/journal.tsx` — NEW this phase, the contractor's
 *     add-entry FAB. `projectId` is whichever project is currently
 *     selected in that screen's own picker/deep-link; `userId` is the
 *     contractor's own auth id, exactly the same shape of value the worker
 *     path already passes (this component has no idea, and doesn't need
 *     to know, whether the caller has a `workers` row — that distinction
 *     is a server-side concern, resolved in `submit_site_log_entry()`
 *     itself; see migration 0069).
 *
 * `orgId` is accepted as a prop rather than re-derived here (both callers
 * already have it from their own `load()`), so this component makes no
 * `getActiveOrgId()`/session calls of its own.
 */
const MAX_RECORDING_SECONDS = 120;

interface SiteLogFormProps {
  orgId: string;
  projectId: string;
  userId: string;
  onSubmitted: () => void;
}

export function SiteLogForm({ orgId, projectId, userId, onSubmitted }: SiteLogFormProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoThumbUri, setPhotoThumbUri] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);

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
      // ever enters the upload queue. The user only sees a brief inline
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

    const idempotencyKey = newIdempotencyKey();
    setSubmitting(true);
    try {
      let location: { lat: number; lng: number } | null = null;
      if (photoUri) {
        // Best-effort only — never blocks submission, per this file's
        // original header note (preserved from update-chantier.tsx).
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

      await database.write(() =>
        createWithClientId(database.get<SiteLog>('site_logs'), (record) => {
          record.orgId = orgId;
          record.projectId = parsed.data.project_id;
          record.photoUrl = parsed.data.photo_url ?? null;
          record.thumbnailUrl = parsed.data.thumbnail_url ?? null;
          record.voiceNoteUrl = parsed.data.voice_note_url ?? null;
          record.noteText = parsed.data.note_text ?? null;
          record.locationLat = parsed.data.location_lat ?? null;
          record.locationLng = parsed.data.location_lng ?? null;
          record.idempotencyKey = parsed.data.idempotency_key;
          record.caption = null;
          record.loggedBy = userId;
        }),
      );
      void runSync();

      haptics.confirm();
      onSubmitted();
    } catch (e: any) {
      haptics.error();
      setError(e?.message ?? "Une erreur est survenue lors de l'envoi. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
  );
}
