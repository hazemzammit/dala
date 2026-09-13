import { notificationPrefsSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Icon3D } from '@/components/ui/Icon3D';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useToast } from '@/components/ui/Toast';
import { Toggle } from '@/components/ui/Toggle';
import { haptics } from '@/lib/haptics';
import { registerForPushNotifications } from '@/lib/pushNotifications';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/notification-settings.tsx
 *
 * NEW in Phase 5 — Doc 03 §3.23's "push toggles per category" plus Doc 02
 * §2.9a's digest opt-in, backed by migration 0025's
 * `profiles.notification_prefs`.
 *
 * settings.tsx (Doc 03 §3.22) was still an unbuilt empty-state stub when
 * this file was first written (Phase 5) — confirmed at the time, but
 * stale by Phase 7, which built it out for real. This comment was found
 * still claiming otherwise during Phase 14's re-read of every screen
 * before scoping that phase's work — corrected here rather than left to
 * mislead a future phase, same "stale cross-file status comment" pattern
 * flagged in portfolio.tsx and trash.tsx. Rather than building out the
 * entire Settings screen at the time (profile, organization, security,
 * language, team members, billing, sign-out, delete-account — none of
 * that was Phase 5 scope), this added ONE new route for the one
 * sub-section that phase actually needed, and settings.tsx got a single
 * link added to it — that part of the reasoning still holds; only the
 * "still a stub" claim about settings.tsx itself was wrong by the time
 * anyone re-read it.
 *
 * Kebab-case flat file, matching this app's existing routing convention
 * (client-portal.tsx, accept-org-invite.tsx, material-request.tsx) rather
 * than a nested settings/notifications.tsx, since settings.tsx already
 * exists as a flat file and expo-router doesn't allow both a file and a
 * same-named folder for one route segment.
 */
type Prefs = {
  dispatch: boolean;
  advances: boolean;
  materials: boolean;
  safety: boolean;
  digest_frequency: 'off' | 'daily' | 'weekly';
};

const DEFAULT_PREFS: Prefs = {
  dispatch: true,
  advances: true,
  materials: true,
  safety: true,
  digest_frequency: 'off',
};

export default function NotificationSettingsScreen() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('id', session.user.id)
      .maybeSingle();
    if (data?.notification_prefs) setPrefs(data.notification_prefs as Prefs);
    setLoading(false);
  }

  async function save(next: Prefs) {
    setPrefs(next);
    const parsed = notificationPrefsSchema.safeParse(next);
    if (!parsed.success) return;

    setSaving(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      return;
    }

    // Only request the push permission/token once the person has actually
    // asked for at least one category or the digest — never speculatively
    // on screen open.
    const anyEnabled =
      next.dispatch ||
      next.advances ||
      next.materials ||
      next.safety ||
      next.digest_frequency !== 'off';
    if (anyEnabled) {
      const result = await registerForPushNotifications();
      if ('error' in result && result.error === 'permission_denied') {
        toast.info(
          'Activez les notifications pour cette application dans les réglages de votre téléphone pour recevoir ces alertes.',
        );
      } else if ('error' in result && result.error === 'unsupported_in_expo_go') {
        toast.info(
          "Les notifications push nécessitent une build de développement — vos préférences sont bien enregistrées, mais les alertes ne s'afficheront pas dans Expo Go.",
        );
      } else if ('error' in result && result.error === 'token_unavailable') {
        // Push credentials (FCM/APNs) aren't configured for this build yet
        // — see pushNotifications.ts's own header. Preferences below still
        // save normally; this just means push delivery itself won't work
        // until that's set up, which is expected on a dev build and not
        // worth alarming the person with a toast over every time they
        // toggle a category.
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: parsed.data })
      .eq('id', session.user.id);

    if (error) {
      toast.error('Impossible de mettre à jour vos préférences.');
      haptics.error();
    } else {
      haptics.confirm();
    }
    setSaving(false);
  }

  if (loading) return null;

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack alignItems="center" gap="$3" paddingHorizontal="$4" paddingBottom="$3">
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={22} />
        </XStack>
        <Text fontFamily="$display" fontSize={18} fontWeight="600">
          Notifications
        </Text>
        <Icon3D name="bell-alert" size={28} />
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$4">
          <ToggleRow
            label="Dispatch"
            value={prefs.dispatch}
            onChange={(v) => void save({ ...prefs, dispatch: v })}
            disabled={saving}
          />
          <ToggleRow
            label="Avances & paie"
            value={prefs.advances}
            onChange={(v) => void save({ ...prefs, advances: v })}
            disabled={saving}
          />
          <ToggleRow
            label="Matériaux"
            value={prefs.materials}
            onChange={(v) => void save({ ...prefs, materials: v })}
            disabled={saving}
          />
          <ToggleRow
            label="Sécurité"
            value={prefs.safety}
            onChange={(v) => void save({ ...prefs, safety: v })}
            disabled={saving}
          />
        </YStack>

        <YStack
          backgroundColor="$neutral0"
          borderRadius="$card"
          padding="$4"
          gap="$2"
          marginTop="$3"
        >
          <Text fontSize={15.5} fontWeight="600">
            Résumé
          </Text>
          <Text fontSize={13} color="$neutral500" marginBottom="$2">
            Recevez un résumé des demandes en attente et du dispatch de demain.
          </Text>
          <SegmentedControl
            value={prefs.digest_frequency}
            onChange={(v) => void save({ ...prefs, digest_frequency: v })}
            options={[
              { value: 'off', label: 'Désactivé', color: '$accent600' },
              { value: 'daily', label: 'Quotidien', color: '$accent600' },
              { value: 'weekly', label: 'Hebdomadaire', color: '$accent600' },
            ]}
          />
        </YStack>
      </ScrollView>
    </YStack>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <XStack justifyContent="space-between" alignItems="center">
      <Text fontSize={14.5}>{label}</Text>
      <Toggle value={value} onChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </XStack>
  );
}
