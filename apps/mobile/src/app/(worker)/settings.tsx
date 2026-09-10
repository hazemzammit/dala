import { color } from '@dala/design-tokens';
import { router, useFocusEffect } from 'expo-router';
import { CaretRightIcon, SignOutIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Icon3D } from '@/components/ui/Icon3D';
import { getSignedUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(worker)/settings.tsx
 *
 * Doc 03 §4.6 — "Minimal: Profil, Téléphone, Email, Sécurité, Langue,
 * Déconnexion. No org/billing sections."
 *
 * IMPROVEMENT-PLAN PHASE 3 (§4.1 step 1) first made "Profil" real: it
 * opened a Sheet limited to avatar upload only, with §4.1 step 3 ("build
 * one consistent profile screen shape reused across contractor/manager/
 * worker") explicitly deferred at the time.
 *
 * IMPROVEMENT-PLAN PHASE 10 (§4.1 step 3, resolved) — that deferral is
 * resolved now: "Profil" pushes to the new `(worker)/profile.tsx` full
 * screen instead of opening the old avatar-only Sheet, exactly matching
 * how the contractor's own "Profil" row has always pushed to
 * `/profile-settings` rather than opening a Sheet. All the avatar-upload
 * logic that used to live in this file's own Sheet (processAvatarPhoto →
 * uploadOrgFile → update profiles → getSignedUrl) has moved into the
 * shared `components/profile/ProfileScreen.tsx` — not duplicated here.
 * This file keeps only what it still owns: the settings LIST (row labels,
 * the still-dead Téléphone/E-mail/Sécurité/Langue rows — unchanged scope
 * boundary from Phase 3, still not wired, since Phase 10's own named
 * scope is "complete profiles," not "wire worker phone/email editing")
 * and Déconnexion.
 */
const DEAD_ROWS = ['Téléphone', 'E-mail', 'Sécurité', 'Langue'];

export default function WorkerSettingsScreen() {
  const [fullName, setFullName] = useState('');
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile) {
      setFullName(profile.full_name ?? '');
      if (profile.avatar_url) setAvatarSignedUrl(await getSignedUrl(profile.avatar_url));
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25" padding="$4">
      <XStack alignItems="center" gap="$2" marginBottom="$4">
        <Icon3D name="settings-gear" size={28} />
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Réglages
        </Text>
      </XStack>

      <YStack backgroundColor="$neutral0" borderRadius="$card" overflow="hidden">
        <XStack
          justifyContent="space-between"
          alignItems="center"
          paddingHorizontal="$4"
          paddingVertical={14}
          onPress={() => router.push('/profile' as never)}
          accessibilityRole="button"
        >
          <XStack alignItems="center" gap="$3">
            <Avatar name={fullName || 'Moi'} imageUrl={avatarSignedUrl ?? undefined} size={36} />
            <Text fontSize={15.5}>Profil</Text>
          </XStack>
          <CaretRightIcon size={16} color={color.neutral[500]} />
        </XStack>
        {DEAD_ROWS.map((row) => (
          <XStack
            key={row}
            justifyContent="space-between"
            alignItems="center"
            paddingHorizontal="$4"
            paddingVertical={14}
            borderTopWidth={1}
            borderTopColor="$neutral100"
          >
            <Text fontSize={15.5}>{row}</Text>
            <CaretRightIcon size={16} color={color.neutral[500]} />
          </XStack>
        ))}
      </YStack>

      <XStack
        marginTop="$4"
        alignItems="center"
        gap="$2"
        paddingVertical={14}
        onPress={handleLogout}
        accessibilityRole="button"
      >
        <SignOutIcon size={18} color={color.status.danger} />
        <Text color="$danger" fontSize={15.5} fontWeight="500">
          Déconnexion
        </Text>
      </XStack>
    </YStack>
  );
}
