import { router } from 'expo-router';
import { ArrowLeftIcon, ChatCircleIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Icon3D } from '@/components/ui/Icon3D';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { currentBuild } from '@/lib/appVersion';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/feedback.tsx
 *
 * IMPROVEMENT-PLAN PHASE 9 §2.8 "In-app feedback" — "Signaler un
 * problème," reached from settings.tsx's new row of the same name.
 *
 * Deliberately does NOT scope to the active org (`org_id` is sent when
 * available, but a worker with no active org can still reach this screen
 * and submit — see migration 0074's `feedback` table comment for why
 * org_id is nullable there; this screen mirrors that same "feedback about
 * the app itself isn't org-scoped data" reasoning rather than gating on
 * `getActiveOrgId()` the way every operational screen in this app does).
 *
 * No confirmation screen/list of past submissions — `feedback` has no
 * client-facing read policy beyond the submitter's own rows (see that
 * table's RLS in migration 0074), and this screen doesn't build one
 * either; a toast + navigate back is the whole interaction, matching the
 * plan's own "simple... affordance" framing for this lowest-priority
 * item.
 *
 * IMPROVEMENT-PLAN Part A — `chat-bubble` Icon3D added as a hero above the
 * form. The guide describes this screen as having "zero icon/illustration"
 * — not quite: the submit Button already carries a small inline
 * `ChatCircleIcon`, which stays. What was actually missing was a larger
 * visual identity for the screen itself. The guide's second icon here,
 * `answer` ("submitted-confirmation state"), is NOT wired: per this
 * file's own comment directly above, the confirmation is a native
 * `Alert.alert` by deliberate design, not an in-app screen/state — adding
 * one just to host an icon would be new scope, not icon wiring.
 */
const CATEGORIES: { value: 'bug' | 'suggestion' | 'question' | 'other'; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Autre' },
];

export default function FeedbackScreen() {
  const [category, setCategory] = useState<'bug' | 'suggestion' | 'question' | 'other'>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!message.trim()) {
      Alert.alert('Message requis', 'Décrivez le problème ou la suggestion.');
      return;
    }
    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Session invalide.');

      const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from('feedback').insert({
        org_id: membership?.org_id ?? null,
        submitted_by: session.user.id,
        category,
        message: message.trim(),
        platform: Platform.OS,
        app_version: currentBuild(),
      });
      if (error) throw error;

      haptics.confirm();
      Alert.alert('Merci !', 'Votre message a bien été transmis.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setMessage('');
    } catch (e: any) {
      haptics.error();
      Alert.alert('Erreur', e?.message ?? "Impossible d'envoyer le message.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" paddingHorizontal="$4">
      <XStack alignItems="center" gap="$3" paddingTop="$2" paddingBottom="$4">
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={20} />
        </XStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600">
          Signaler un problème
        </Text>
      </XStack>

      <YStack alignItems="center" marginBottom="$2">
        <Icon3D name="chat-bubble" />
      </YStack>

      <YStack gap="$1.5" marginBottom="$4">
        <Text fontSize={14} fontWeight="500">
          Catégorie
        </Text>
        <SegmentedControl
          value={category}
          onChange={setCategory}
          options={CATEGORIES.map((c) => ({
            value: c.value,
            label: c.label,
            color: '$neutral900',
          }))}
        />
      </YStack>

      <FormField
        label="Message"
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={6}
        placeholder="Décrivez ce que vous avez rencontré…"
      />

      <XStack marginTop="$4">
        <Button onPress={handleSubmit} loading={submitting} icon={ChatCircleIcon}>
          Envoyer
        </Button>
      </XStack>
    </YStack>
  );
}
