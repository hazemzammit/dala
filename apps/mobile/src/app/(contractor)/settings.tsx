import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import {
  BellIcon,
  BuildingsIcon,
  CaretRightIcon,
  GlobeIcon,
  ReceiptIcon,
  ShieldIcon,
  SignOutIcon,
  TrashIcon,
  UserIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Sheet } from '@/components/ui/Sheet';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/settings.tsx
 *
 * Phase 7 — Doc 03 §3.22. Replaces the Phase-5 stub (a single Notifications
 * link) that carried across Phases 5/6 unbuilt.
 *
 * "Langue" is handled as its own row here (a bottom sheet, no navigation),
 * NOT duplicated inside Profile as well even though §3.22.1's field table
 * also lists it — showing the same setting in two places would be
 * confusing, not a spec requirement worth reproducing literally. "Membres
 * de l'équipe" routes to the new team-members.tsx (organization_members —
 * owner/manager/viewer accounts), which is deliberately a different screen
 * from the existing team.tsx (workers — field employees, Doc 03 §3.13) —
 * see team-members.tsx's own header for why those are two different
 * entities the spec's one line item conflates.
 */
const LOCALE_OPTIONS: { value: 'fr' | 'ar' | 'en'; label: string }[] = [
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

export default function SettingsScreen() {
  const [langSheetOpen, setLangSheetOpen] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);

  async function handleLocaleChange(locale: 'fr' | 'ar' | 'en') {
    setSavingLocale(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_locale: locale })
        .eq('id', session.user.id);
      if (error) {
        Alert.alert('Erreur', 'Impossible de mettre à jour la langue.');
        haptics.error();
        setSavingLocale(false);
        return;
      }
    }
    haptics.confirm();
    setSavingLocale(false);
    setLangSheetOpen(false);
  }

  function confirmSignOut() {
    Alert.alert('Se déconnecter ?', 'Vous devrez vous reconnecter pour accéder à votre compte.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: () => {
          void supabase.auth.signOut().then(() => router.replace('/login' as never));
        },
      },
    ]);
  }

  const rows: {
    icon: typeof UserIcon;
    label: string;
    onPress: () => void;
    destructive?: boolean;
    testID?: string;
  }[] = [
    { icon: UserIcon, label: 'Profil', onPress: () => router.push('/profile-settings' as never) },
    {
      icon: BuildingsIcon,
      label: 'Organisation',
      onPress: () => router.push('/organization-settings' as never),
    },
    {
      icon: ShieldIcon,
      label: 'Sécurité',
      onPress: () => router.push('/security-settings' as never),
      testID: 'settings-security-row',
    },
    {
      icon: BellIcon,
      label: 'Notifications',
      onPress: () => router.push('/notification-settings' as never),
    },
    { icon: GlobeIcon, label: 'Langue', onPress: () => setLangSheetOpen(true) },
    {
      icon: UsersThreeIcon,
      label: "Membres de l'équipe",
      onPress: () => router.push('/team-members' as never),
    },
    { icon: ReceiptIcon, label: 'Facturation', onPress: () => router.push('/billing' as never) },
    {
      icon: SignOutIcon,
      label: 'Déconnexion',
      onPress: confirmSignOut,
      testID: 'settings-logout-row',
    },
    {
      icon: TrashIcon,
      label: 'Supprimer mon compte',
      onPress: () => router.push('/delete-account' as never),
      destructive: true,
    },
  ];

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <YStack paddingTop={56} paddingHorizontal="$4" paddingBottom="$3">
        <Text fontFamily="$display" fontSize={23} fontWeight="600">
          Paramètres
        </Text>
      </YStack>

      <YStack paddingHorizontal="$4" gap="$2">
        {rows.map((row) => (
          <XStack
            key={row.label}
            testID={row.testID}
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            alignItems="center"
            justifyContent="space-between"
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={row.label}
          >
            <XStack alignItems="center" gap="$3">
              <row.icon
                size={20}
                color={row.destructive ? color.status.danger : color.neutral[900]}
              />
              <Text fontSize={15} color={row.destructive ? '$danger' : '$neutral900'}>
                {row.label}
              </Text>
            </XStack>
            <CaretRightIcon size={16} color={color.neutral[500]} />
          </XStack>
        ))}
      </YStack>

      <Sheet visible={langSheetOpen} onClose={() => setLangSheetOpen(false)} title="Langue">
        <YStack gap="$2">
          {LOCALE_OPTIONS.map((opt) => (
            <XStack
              key={opt.value}
              paddingVertical={14}
              paddingHorizontal="$2"
              justifyContent="space-between"
              alignItems="center"
              onPress={() => void handleLocaleChange(opt.value)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              opacity={savingLocale ? 0.6 : 1}
            >
              <Text fontSize={15}>{opt.label}</Text>
            </XStack>
          ))}
        </YStack>
      </Sheet>
    </YStack>
  );
}
