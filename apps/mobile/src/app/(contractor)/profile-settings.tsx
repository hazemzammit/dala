import { color } from '@dala/design-tokens';
import {
  changePhoneSchema,
  confirmPhoneChangeSchema,
  requestEmailChangeSchema,
} from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon, CameraIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processAvatarPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/profile-settings.tsx
 *
 * Phase 7 — Doc 03 §3.22.1. Kebab-case flat file, matching this app's
 * routing convention (settings.tsx already exists as a flat file).
 *
 * Email change uses Supabase Auth's own built-in secure-email-change flow
 * (supabase.auth.updateUser({ email })) rather than a custom table —
 * confirmed this targets auth.users.email directly, which is where the
 * app's login email actually lives (profiles has no email column at all).
 * Supabase already double-confirms old+new addresses natively, matching
 * §3.22.1's exact copy about both addresses receiving a confirmation.
 *
 * Phone change is NOT the same shape — profiles.phone has never been tied
 * to Supabase Auth's own phone-OTP channel (confirmed: sign-up only ever
 * copies phone from signup metadata, migration 0002), so this uses the new
 * request_phone_change/confirm_phone_change RPCs (migration 0028) instead.
 * See that migration's header for the disclosed SMS-provider gap — the
 * code is generated and verified correctly either way; only the actual SMS
 * delivery depends on a Vault secret this repo doesn't have configured.
 */
export default function ProfileSettingsScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [savingName, setSavingName] = useState(false);

  const [phoneSheetOpen, setPhoneSheetOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<'enter' | 'confirm'>('enter');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailPending, setEmailPending] = useState(false);

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
    setUserId(session.user.id);
    setEmail(session.user.email ?? '');

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, phone, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      if (profile.avatar_url) {
        setAvatarSignedUrl(await getSignedUrl(profile.avatar_url));
      }
    }
    setLoading(false);
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error("Autorisez l'accès à vos photos pour changer votre avatar.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0] || !userId) return;

    setUploadingAvatar(true);
    try {
      const orgId = await getActiveOrgId();
      if (!orgId) throw new Error('no org');
      const processedUri = await processAvatarPhoto(result.assets[0].uri);
      const path = await uploadOrgFile(orgId, 'avatars', processedUri, 'jpg', 'image/jpeg');

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: path })
        .eq('id', userId);
      if (error) throw error;

      setAvatarSignedUrl(await getSignedUrl(path));
      haptics.confirm();
      toast.success('Photo de profil mise à jour.');
    } catch {
      toast.error("Impossible de mettre à jour l'avatar.");
      haptics.error();
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveName() {
    if (!userId || fullName.trim().length < 2) return;
    setSavingName(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', userId);
    setSavingName(false);
    if (error) {
      toast.error('Impossible de mettre à jour le nom.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Nom mis à jour.');
  }

  function openPhoneSheet() {
    setNewPhone(phone);
    setPhoneStep('enter');
    setPhoneCode('');
    setPhoneError(null);
    setPhoneSheetOpen(true);
  }

  async function handleRequestPhoneCode() {
    setPhoneError(null);
    const parsed = changePhoneSchema.safeParse({ new_phone: newPhone.trim() });
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message ?? 'Numéro invalide.');
      return;
    }
    setPhoneBusy(true);
    const { error } = await supabase.rpc('request_phone_change', {
      p_new_phone: parsed.data.new_phone,
    });
    setPhoneBusy(false);
    if (error) {
      setPhoneError("Impossible d'envoyer le code. Réessayez.");
      haptics.error();
      return;
    }
    haptics.confirm();
    setPhoneStep('confirm');
  }

  async function handleConfirmPhoneCode() {
    setPhoneError(null);
    const parsed = confirmPhoneChangeSchema.safeParse({ code: phoneCode.trim() });
    if (!parsed.success) {
      setPhoneError('Le code doit contenir 6 chiffres.');
      return;
    }
    setPhoneBusy(true);
    const { error } = await supabase.rpc('confirm_phone_change', { p_code: parsed.data.code });
    setPhoneBusy(false);
    if (error) {
      setPhoneError(error.message.includes('expiré') ? 'Ce code a expiré.' : 'Code incorrect.');
      haptics.error();
      return;
    }
    haptics.confirm();
    setPhone(newPhone.trim());
    setPhoneSheetOpen(false);
    toast.success('Numéro de téléphone mis à jour.');
  }

  function openEmailSheet() {
    setNewEmail('');
    setEmailError(null);
    setEmailSheetOpen(true);
  }

  async function handleRequestEmailChange() {
    setEmailError(null);
    const parsed = requestEmailChangeSchema.safeParse({ new_email: newEmail.trim() });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'E-mail invalide.');
      return;
    }
    setEmailBusy(true);
    // Doc 03 §3.22.1 — Supabase Auth's built-in double-confirmation flow
    // (both old and new addresses get a confirmation link; the change
    // only takes effect once confirmed). Not a custom Edge Function.
    const { error } = await supabase.auth.updateUser({ email: parsed.data.new_email });
    setEmailBusy(false);
    if (error) {
      setEmailError("Impossible d'envoyer la confirmation.");
      haptics.error();
      return;
    }
    haptics.confirm();
    setEmailPending(true);
    setEmailSheetOpen(false);
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={4} />
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack paddingHorizontal="$4" paddingBottom="$3" alignItems="center" gap="$3">
        <XStack
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ArrowLeftIcon size={20} />
        </XStack>
        <Text fontFamily="$display" fontSize={20} fontWeight="600">
          Profil
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <YStack alignItems="center" marginBottom="$5">
          <View
            onPress={() => void handlePickAvatar()}
            accessibilityRole="button"
            accessibilityLabel="Changer la photo de profil"
          >
            <Avatar name={fullName || 'U'} imageUrl={avatarSignedUrl ?? undefined} size={88} />
            <View
              position="absolute"
              bottom={0}
              right={0}
              backgroundColor="$accent600"
              borderRadius={999}
              padding={6}
            >
              <CameraIcon size={14} color={color.neutral[0]} />
            </View>
          </View>
          {uploadingAvatar && (
            <Text fontSize={12.5} color="$neutral500" marginTop="$2">
              Envoi de la photo…
            </Text>
          )}
        </YStack>

        <YStack gap="$4">
          <FormField label="Nom complet" value={fullName} onChangeText={setFullName} />
          <Button variant="secondary" onPress={() => void handleSaveName()} loading={savingName}>
            Enregistrer le nom
          </Button>

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              Téléphone
            </Text>
            <XStack
              backgroundColor="$neutral0"
              borderRadius="$control"
              borderWidth={1}
              borderColor="$neutral300"
              padding={14}
              justifyContent="space-between"
              alignItems="center"
              onPress={openPhoneSheet}
              accessibilityRole="button"
              accessibilityLabel="Modifier le téléphone"
            >
              <Text fontSize={15}>{phone || 'Ajouter un numéro'}</Text>
              <Text fontSize={13} color="$accent600" fontWeight="600">
                Modifier
              </Text>
            </XStack>
          </YStack>

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              E-mail
            </Text>
            <XStack
              backgroundColor="$neutral0"
              borderRadius="$control"
              borderWidth={1}
              borderColor="$neutral300"
              padding={14}
              justifyContent="space-between"
              alignItems="center"
              onPress={openEmailSheet}
              accessibilityRole="button"
              accessibilityLabel="Modifier l'e-mail"
            >
              <Text fontSize={15}>{email}</Text>
              <Text fontSize={13} color="$accent600" fontWeight="600">
                Modifier
              </Text>
            </XStack>
            {emailPending && (
              <Text fontSize={12.5} color="$neutral500">
                Un e-mail de confirmation a été envoyé à {newEmail || 'la nouvelle adresse'} et à{' '}
                {email}. Le changement prendra effet une fois confirmé.
              </Text>
            )}
          </YStack>
        </YStack>
      </ScrollView>

      <Sheet
        visible={phoneSheetOpen}
        onClose={() => setPhoneSheetOpen(false)}
        title={phoneStep === 'enter' ? 'Modifier le téléphone' : 'Confirmez votre numéro'}
      >
        {phoneStep === 'enter' ? (
          <YStack gap="$3">
            <FormField
              label="Nouveau numéro"
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
            />
            {phoneError && (
              <Text fontSize={13} color="$danger">
                {phoneError}
              </Text>
            )}
            <Button onPress={() => void handleRequestPhoneCode()} loading={phoneBusy}>
              Envoyer le code
            </Button>
          </YStack>
        ) : (
          <YStack gap="$3">
            <Text fontSize={14} color="$neutral500">
              Confirmez votre nouveau numéro. Un code à 6 chiffres a été envoyé par SMS.
            </Text>
            <FormField
              label="Code à 6 chiffres"
              value={phoneCode}
              onChangeText={setPhoneCode}
              keyboardType="number-pad"
            />
            {phoneError && (
              <Text fontSize={13} color="$danger">
                {phoneError}
              </Text>
            )}
            <Button onPress={() => void handleConfirmPhoneCode()} loading={phoneBusy}>
              Confirmer
            </Button>
            <Button variant="text" onPress={() => void handleRequestPhoneCode()}>
              Renvoyer le code
            </Button>
          </YStack>
        )}
      </Sheet>

      <Sheet
        visible={emailSheetOpen}
        onClose={() => setEmailSheetOpen(false)}
        title="Modifier l'e-mail"
      >
        <YStack gap="$3">
          <FormField
            label="Nouvelle adresse e-mail"
            value={newEmail}
            onChangeText={setNewEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {emailError && (
            <Text fontSize={13} color="$danger">
              {emailError}
            </Text>
          )}
          <Button onPress={() => void handleRequestEmailChange()} loading={emailBusy}>
            Envoyer la confirmation
          </Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}
