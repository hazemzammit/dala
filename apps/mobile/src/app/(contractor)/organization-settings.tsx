import { color } from '@dala/design-tokens';
import { updateOrganizationSchema } from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon, BuildingsIcon, CameraIcon, LockIcon } from 'phosphor-react-native';
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { Image, Text, View, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processLogoPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/organization-settings.tsx
 *
 * Phase 7 — Doc 03 §3.22.2. Owner+manager can edit name/trade_type/
 * address/contact fields; matricule_fiscal/rc_number are rendered
 * read-only with a lock icon for a manager, matching the lock-icon
 * treatment Doc 03 describes — actual enforcement against a modified
 * client is the update_organization_profile RPC (migration 0028), since
 * organizations_update_owner_manager (0005) is a row-level RLS policy and
 * can't express "manager may edit these columns but not those two."
 */
export default function OrganizationSettingsScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'manager' | 'viewer' | null>(null);

  const [name, setName] = useState('');
  const [tradeType, setTradeType] = useState('');
  const [address, setAddress] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [matriculeFiscal, setMatriculeFiscal] = useState('');
  const [rcNumber, setRcNumber] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoSignedUrl, setLogoSignedUrl] = useState<string | null>(null);

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, []),
  );

  async function load() {
    setLoading(true);
    const activeOrgId = await getActiveOrgId();
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setOrgId(activeOrgId);
    setRole(await getMyOrgRole(activeOrgId));

    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', activeOrgId)
      .maybeSingle();
    if (org) {
      setName(org.name ?? '');
      setTradeType(org.trade_type ?? '');
      setAddress(org.address ?? '');
      setContactPhone(org.contact_phone ?? '');
      setContactEmail(org.contact_email ?? '');
      setMatriculeFiscal(org.matricule_fiscal ?? '');
      setRcNumber(org.rc_number ?? '');
      setLogoPath(org.logo_url ?? null);
      if (org.logo_url) setLogoSignedUrl(await getSignedUrl(org.logo_url));
    }
    setLoading(false);
  }

  const isOwner = role === 'owner';
  const canEdit = role === 'owner' || role === 'manager';

  async function handlePickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error("Autorisez l'accès à vos photos pour changer le logo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0] || !orgId) return;

    setUploadingLogo(true);
    try {
      const processedUri = await processLogoPhoto(result.assets[0].uri);
      const path = await uploadOrgFile(orgId, 'logo', processedUri, 'png', 'image/png');
      setLogoPath(path);
      setLogoSignedUrl(await getSignedUrl(path));
      toast.success('Logo mis à jour.');
    } catch {
      toast.error('Impossible de mettre à jour le logo.');
      haptics.error();
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSave() {
    if (!orgId) return;
    setError(null);

    const parsed = updateOrganizationSchema.safeParse({
      name: name.trim(),
      trade_type: tradeType.trim() || undefined,
      address: address.trim() || undefined,
      contact_phone: contactPhone.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      logo_url: logoPath ?? undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSaving(true);
    const { error: rpcError } = await supabase.rpc('update_organization_profile', {
      p_org_id: orgId,
      p_name: parsed.data.name,
      p_trade_type: parsed.data.trade_type ?? null,
      p_address: parsed.data.address ?? null,
      p_contact_phone: parsed.data.contact_phone ?? null,
      p_contact_email: parsed.data.contact_email ?? null,
      p_matricule_fiscal: matriculeFiscal.trim() || null,
      p_rc_number: rcNumber.trim() || null,
      p_logo_url: parsed.data.logo_url ?? null,
    });
    setSaving(false);

    if (rpcError) {
      setError("Impossible d'enregistrer l'organisation.");
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Organisation mise à jour.');
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={5} />
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
          Organisation
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <YStack alignItems="center" marginBottom="$5">
          <View
            width={88}
            height={88}
            borderRadius={16}
            backgroundColor="$neutral100"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
            onPress={canEdit ? () => void handlePickLogo() : undefined}
            accessibilityRole="button"
            accessibilityLabel="Changer le logo"
          >
            {logoSignedUrl ? (
              <Image src={logoSignedUrl} width={88} height={88} />
            ) : (
              <BuildingsIcon size={32} color={color.neutral[500]} />
            )}
          </View>
          {canEdit && (
            <View
              position="absolute"
              bottom={0}
              right="30%"
              backgroundColor="$accent600"
              borderRadius={999}
              padding={6}
            >
              <CameraIcon size={14} color={color.neutral[0]} />
            </View>
          )}
          {uploadingLogo && (
            <Text fontSize={12.5} color="$neutral500" marginTop="$2">
              Envoi du logo…
            </Text>
          )}
        </YStack>

        <YStack gap="$4">
          <FormField
            label="Nom de l'organisation"
            value={name}
            onChangeText={setName}
            editable={canEdit}
          />
          <FormField
            label="Corps de métier"
            value={tradeType}
            onChangeText={setTradeType}
            editable={canEdit}
          />
          <FormField label="Adresse" value={address} onChangeText={setAddress} editable={canEdit} />
          <FormField
            label="Téléphone de contact"
            value={contactPhone}
            onChangeText={setContactPhone}
            editable={canEdit}
            keyboardType="phone-pad"
          />
          <FormField
            label="E-mail de contact"
            value={contactEmail}
            onChangeText={setContactEmail}
            editable={canEdit}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <YStack gap="$1.5">
            <XStack alignItems="center" gap="$1.5">
              <Text fontSize={14} fontWeight="500" color="$neutral900">
                Matricule fiscal
              </Text>
              {!isOwner && <LockIcon size={13} color={color.neutral[500]} />}
            </XStack>
            <FormField
              label=""
              value={matriculeFiscal}
              onChangeText={setMatriculeFiscal}
              editable={isOwner}
            />
          </YStack>

          <YStack gap="$1.5">
            <XStack alignItems="center" gap="$1.5">
              <Text fontSize={14} fontWeight="500" color="$neutral900">
                Registre de commerce
              </Text>
              {!isOwner && <LockIcon size={13} color={color.neutral[500]} />}
            </XStack>
            <FormField label="" value={rcNumber} onChangeText={setRcNumber} editable={isOwner} />
          </YStack>

          {error && (
            <Text fontSize={13} color="$danger">
              {error}
            </Text>
          )}

          {canEdit && (
            <Button onPress={() => void handleSave()} loading={saving}>
              Enregistrer
            </Button>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
