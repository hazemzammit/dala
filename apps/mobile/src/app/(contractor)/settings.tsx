import { color } from '@dala/design-tokens';
import { router } from 'expo-router';
import {
  BellIcon,
  BuildingsIcon,
  CaretRightIcon,
  ChatCircleIcon,
  GlobeIcon,
  ReceiptIcon,
  ShieldIcon,
  SignOutIcon,
  TrashIcon,
  UserIcon,
  UsersThreeIcon,
} from 'phosphor-react-native';
import { Alert } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { Icon3D } from '@/components/ui/Icon3D';
import { signOutAndWipe } from '@/lib/signOut';

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
 *
 * IMPROVEMENT-PLAN PHASE 1 (§8) — DECISION, stated plainly: this row used
 * to open a sheet offering Français/العربية/English, writing the choice to
 * `profiles.preferred_locale` — but no i18n library exists anywhere in
 * this app (every screen's text is hardcoded French), so picking Arabic or
 * English changed nothing. That's worse than not offering the choice at
 * all: it actively promised a working translation the app didn't deliver,
 * to exactly the audience (workers more comfortable in Arabic than French)
 * this app most needs to serve well.
 *
 * Chose "strip to what's real" over "build i18n now": full i18n (string
 * extraction across ~50 screens, RTL layout support and mirrored-screen
 * testing for Arabic) is explicitly a **Big** item with no dependency on
 * anything else in Phase 1's foundation work, and the plan frames this
 * section as a decision to make now, not a build to schedule now. The
 * "Langue" row stays (removing it entirely would erase the setting's
 * existence rather than being honest about its current state) but the
 * sheet no longer offers Arabic/English — it shows a single, disabled,
 * pre-selected "Français" row plus a short explanatory line, so nothing
 * on screen promises functionality that doesn't exist. `preferred_locale`
 * itself is left alone (still `'fr'` for every existing profile; no
 * migration needed) — real i18n, whenever it's built, can start from
 * there rather than needing a data backfill.
 */
export default function SettingsScreen() {
  function showLanguageInfo() {
    Alert.alert(
      'Langue',
      "Dala est disponible en français uniquement pour le moment. Une prise en charge de l'arabe est prévue.",
    );
  }

  function confirmSignOut() {
    Alert.alert('Se déconnecter ?', 'Vous devrez vous reconnecter pour accéder à votre compte.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        style: 'destructive',
        onPress: () => {
          void signOutAndWipe(() => router.replace('/login' as never));
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
    // PHASE 1 (§8) — was `onPress: () => setLangSheetOpen(true)`, opening
    // a sheet with three locale options only one of which actually did
    // anything. Now surfaces an honest one-line explanation instead of a
    // picker with two dead options. See file header for the full decision.
    { icon: GlobeIcon, label: 'Langue', onPress: showLanguageInfo },
    {
      icon: UsersThreeIcon,
      label: "Membres de l'équipe",
      onPress: () => router.push('/team-members' as never),
    },
    { icon: ReceiptIcon, label: 'Facturation', onPress: () => router.push('/billing' as never) },
    // PHASE 9 §2.8 — "Signaler un problème." Placed here rather than a
    // floating in-app button (e.g. PlusSheet.tsx) since this is a
    // deliberately low-frequency, low-urgency action — the plan's own
    // wording ranks §2.7/§2.8 "lowest priority" of Phase 9 — not
    // something that needs one-tap access from every screen.
    {
      icon: ChatCircleIcon,
      label: 'Signaler un problème',
      onPress: () => router.push('/feedback' as never),
    },
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
      <YStack paddingHorizontal="$4" paddingBottom="$3">
        <XStack alignItems="center" gap="$2">
          <Icon3D name="settings-gear" size={40} />
          <Text fontFamily="$display" fontSize={23} fontWeight="600">
            Paramètres
          </Text>
        </XStack>
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
    </YStack>
  );
}
