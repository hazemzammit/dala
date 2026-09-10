import { color } from '@dala/design-tokens';
import type { OrganizationLegalForm, WorkforceSizeBracket } from '@dala/shared-types';
import {
  updateOrganizationExtendedProfileSchema,
  updateOrganizationRibSchema,
  updateOrganizationSchema,
} from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftIcon,
  BuildingsIcon,
  CameraIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  MapPinIcon,
  PhoneIcon,
} from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Image, Text, View, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { FormField } from '@/components/ui/FormField';
import { PermissionLock } from '@/components/ui/PermissionLock';
import { ProgressBar } from '@/components/ui/Progress';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId, getMyOrgRole } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processLogoPhoto } from '@/lib/photoPipeline';
import { TRADE_OPTIONS } from '@/lib/pickerOptions';
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
 *
 * IMPROVEMENT-PLAN PHASE 10 (§4.2) adds: legal_form, workforce_size_bracket
 * (with a live-count override once the org has workers — reuses team.tsx's
 * own `active_workers` view rather than a second headcount computation,
 * per this phase's own Step 1 instruction), facebook/instagram/website
 * URLs, service_area, a read-only verification_status badge, and RIB
 * (owner-only, via its own encrypted-storage RPC — see migration 0075's
 * header for the encryption decision).
 *
 * legal_form/workforce_size_bracket deliberately do NOT use the shared
 * `Select.tsx` picker, unlike trade_type just above them on this same
 * screen: `Select.tsx` always offers a free-text "Autre" fallback (its own
 * source confirms there's no prop to disable that), which is correct for
 * every OTHER picker in this app (trade_type, coverage, material, absence
 * reason — all genuinely free text with presets) but wrong here, since
 * these two columns have real CHECK constraints in migration 0075
 * restricting them to a closed enum — a free-typed value would fail the
 * constraint with a confusing RPC error instead of a clear inline one. A
 * small local chip-row control is used instead (below), not a new shared
 * component, for what is only two closed-enum fields on one screen.
 *
 * The `.select('*')` this screen used for organizations before Phase 10
 * is now an explicit column list that leaves out `rib_encrypted` — that
 * bytea ciphertext has no reason to ever reach a mobile client at all
 * (get_organization_rib_masked, migration 0075, is the only RIB read this
 * screen performs), so it's excluded at the query itself rather than
 * fetched-then-ignored.
 */
const LEGAL_FORM_OPTIONS: { value: OrganizationLegalForm; label: string }[] = [
  { value: 'personne_physique', label: 'Personne physique' },
  { value: 'sarl', label: 'SARL' },
  { value: 'suarl', label: 'SUARL' },
  { value: 'sa', label: 'SA' },
];

const WORKFORCE_BRACKET_OPTIONS: { value: WorkforceSizeBracket; label: string }[] = [
  { value: '1', label: '1' },
  { value: '2_10', label: '2–10' },
  { value: '11_50', label: '11–50' },
  { value: '51_plus', label: '51+' },
];

const VERIFICATION_LABEL: Record<string, string> = {
  unverified: 'Non vérifiée',
  pending: 'Vérification en cours',
  verified: 'Vérifiée',
};
export default function OrganizationSettingsScreen() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  // Phase 20 (§1.7a) — the primary org fetch had no error capture; a
  // failed fetch previously left every field blank, indistinguishable
  // from a never-filled-in org.
  const [loadError, setLoadError] = useState(false);
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

  // Phase 10 §4.2
  const [legalForm, setLegalForm] = useState<OrganizationLegalForm | null>(null);
  const [workforceBracket, setWorkforceBracket] = useState<WorkforceSizeBracket | null>(null);
  const [liveWorkerCount, setLiveWorkerCount] = useState<number | null>(null);
  const [facebookUrl, setFacebookUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('unverified');
  const [savingExtended, setSavingExtended] = useState(false);
  const [extendedError, setExtendedError] = useState<string | null>(null);

  const [ribLast4, setRibLast4] = useState<string | null>(null);
  const [ribSheetOpen, setRibSheetOpen] = useState(false);
  const [ribDraft, setRibDraft] = useState('');
  const [ribError, setRibError] = useState<string | null>(null);
  const [savingRib, setSavingRib] = useState(false);

  const [checklistDismissed, setChecklistDismissed] = useState(false);
  // Audit fix 3b (Option B) — self-serve verification request.
  const [requestingVerification, setRequestingVerification] = useState(false);

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
    setLoadError(false);
    const activeOrgId = await getActiveOrgId();
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setOrgId(activeOrgId);
    setRole(await getMyOrgRole(activeOrgId));

    // Explicit column list, not `.select('*')` — see this file's own
    // header for why `rib_encrypted` is deliberately never selected here.
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select(
        'name, trade_type, address, contact_phone, contact_email, matricule_fiscal, rc_number, logo_url, legal_form, workforce_size_bracket, facebook_url, instagram_url, website_url, service_area, verification_status, org_checklist_dismissed_at',
      )
      .eq('id', activeOrgId)
      .maybeSingle();
    if (orgError) {
      setLoadError(true);
      setLoading(false);
      return;
    }
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
      setLegalForm(org.legal_form ?? null);
      setWorkforceBracket(org.workforce_size_bracket ?? null);
      setFacebookUrl(org.facebook_url ?? '');
      setInstagramUrl(org.instagram_url ?? '');
      setWebsiteUrl(org.website_url ?? '');
      setServiceArea(org.service_area ?? '');
      setVerificationStatus(org.verification_status ?? 'unverified');
      setChecklistDismissed(!!org.org_checklist_dismissed_at);
    }

    // Live worker count — reuses the same `active_workers` view team.tsx
    // already queries (Step 1's own instruction), not a second
    // computation. This is a DISPLAY override of workforce_size_bracket,
    // never a write-back to that column (see migration 0075's comment on
    // that column for why).
    const { count } = await supabase
      .from('active_workers')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', activeOrgId);
    setLiveWorkerCount(count ?? 0);

    const { data: ribData } = await supabase.rpc('get_organization_rib_masked', {
      p_org_id: activeOrgId,
    });
    setRibLast4(ribData?.rib_last4 ?? null);

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

  const displayedWorkforce = useMemo(() => {
    if (liveWorkerCount !== null && liveWorkerCount > 0)
      return `${liveWorkerCount} (compte actuel)`;
    return WORKFORCE_BRACKET_OPTIONS.find((o) => o.value === workforceBracket)?.label ?? null;
  }, [liveWorkerCount, workforceBracket]);

  const completion = useMemo(() => {
    const checks = [
      !!logoPath,
      !!legalForm,
      !!workforceBracket,
      !!serviceArea.trim(),
      !!matriculeFiscal.trim(),
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  }, [logoPath, legalForm, workforceBracket, serviceArea, matriculeFiscal]);

  async function handleToggleChecklist(dismiss: boolean) {
    if (!orgId) return;
    setChecklistDismissed(dismiss);
    const { error: rpcError } = await supabase.rpc('dismiss_org_checklist', {
      p_org_id: orgId,
      p_dismissed: dismiss,
    });
    if (rpcError) setChecklistDismissed(!dismiss);
  }

  async function handleSaveExtended() {
    if (!orgId) return;
    setExtendedError(null);

    const parsed = updateOrganizationExtendedProfileSchema.safeParse({
      legal_form: legalForm ?? undefined,
      workforce_size_bracket: workforceBracket ?? undefined,
      facebook_url: facebookUrl.trim(),
      instagram_url: instagramUrl.trim(),
      website_url: websiteUrl.trim(),
      service_area: serviceArea.trim() || undefined,
    });
    if (!parsed.success) {
      setExtendedError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSavingExtended(true);
    const { error: rpcError } = await supabase.rpc('update_organization_extended_profile', {
      p_org_id: orgId,
      p_legal_form: parsed.data.legal_form ?? null,
      p_workforce_size_bracket: parsed.data.workforce_size_bracket ?? null,
      p_facebook_url: parsed.data.facebook_url || null,
      p_instagram_url: parsed.data.instagram_url || null,
      p_website_url: parsed.data.website_url || null,
      p_service_area: parsed.data.service_area ?? null,
    });
    setSavingExtended(false);

    if (rpcError) {
      setExtendedError('Impossible d\u2019enregistrer ces informations.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Informations mises à jour.');
  }

  // Audit fix 3b (Option B) — request_org_verification (0089). Only
  // callable from 'unverified' (button is hidden otherwise, see render
  // below); the RPC itself is also a no-op from any other status, so
  // there's no invalid-state error path to handle here beyond a generic
  // failure toast.
  async function requestVerification() {
    if (!orgId) return;
    setRequestingVerification(true);
    const { error: rpcError } = await supabase.rpc('request_org_verification', {
      p_org_id: orgId,
    });
    setRequestingVerification(false);
    if (rpcError) {
      toast.error('Impossible d\u2019envoyer la demande de vérification.');
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Demande de vérification envoyée.');
    setVerificationStatus('pending');
  }

  function openRibSheet() {
    setRibDraft('');
    setRibError(null);
    setRibSheetOpen(true);
  }

  async function handleSaveRib() {
    if (!orgId) return;
    setRibError(null);
    const parsed = updateOrganizationRibSchema.safeParse({ rib: ribDraft.trim() });
    if (!parsed.success) {
      setRibError(parsed.error.issues[0]?.message ?? 'RIB invalide.');
      return;
    }
    setSavingRib(true);
    const { error: rpcError } = await supabase.rpc('update_organization_rib', {
      p_org_id: orgId,
      p_rib: parsed.data.rib,
    });
    setSavingRib(false);
    if (rpcError) {
      setRibError("Impossible d'enregistrer le RIB.");
      haptics.error();
      return;
    }
    haptics.confirm();
    setRibLast4(parsed.data.rib.replace(/\s/g, '').slice(-4) || null);
    setRibSheetOpen(false);
    toast.success('RIB enregistré.');
  }

  if (loading) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <SkeletonList rows={5} />
      </YStack>
    );
  }

  if (loadError) {
    return (
      <YStack flex={1} backgroundColor="$neutral25">
        <ErrorState onRetry={() => void load()} />
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
        {/* Phase 10 §4.4 — org completion signal, same dismiss/undismiss
            shape as ProfileScreen.tsx's individual equivalent (both are
            new this phase — org_checklist_dismissed_at had zero consumers
            before this migration, confirmed by grep, not assumed — see
            migration 0075's Part 6 header). */}
        {canEdit && !checklistDismissed && completion < 100 && (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            marginBottom="$4"
            gap="$2.5"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={14} fontWeight="600" color="$neutral900">
                Profil de l&rsquo;organisation complété à {completion}%
              </Text>
              <Button
                variant="chip"
                fullWidth={false}
                onPress={() => void handleToggleChecklist(true)}
              >
                Masquer
              </Button>
            </XStack>
            <ProgressBar value={completion} />
          </YStack>
        )}
        {canEdit && checklistDismissed && completion < 100 && (
          <XStack marginBottom="$4" gap="$2" alignItems="center">
            <Text fontSize={12.5} color="$neutral500">
              Profil de l&rsquo;organisation complété à {completion}%
            </Text>
            <Button
              variant="chip"
              fullWidth={false}
              onPress={() => void handleToggleChecklist(false)}
            >
              Afficher les suggestions
            </Button>
          </XStack>
        )}

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
          {canEdit ? (
            <Select
              label="Corps de métier"
              value={tradeType || null}
              onChange={setTradeType}
              options={TRADE_OPTIONS}
            />
          ) : (
            <FormField label="Corps de métier" value={tradeType} editable={false} />
          )}
          <FormField
            label="Adresse"
            icon={MapPinIcon}
            value={address}
            onChangeText={setAddress}
            editable={canEdit}
          />
          <FormField
            label="Téléphone de contact"
            icon={PhoneIcon}
            value={contactPhone}
            onChangeText={setContactPhone}
            editable={canEdit}
            keyboardType="phone-pad"
          />
          <FormField
            label="E-mail de contact"
            icon={EnvelopeIcon}
            value={contactEmail}
            onChangeText={setContactEmail}
            editable={canEdit}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <YStack gap="$1.5">
            <PermissionLock locked={!isOwner} reason="Seul le propriétaire peut modifier ce champ.">
              <Text fontSize={14} fontWeight="500" color="$neutral900">
                Matricule fiscal
              </Text>
            </PermissionLock>
            <FormField
              label=""
              value={matriculeFiscal}
              onChangeText={setMatriculeFiscal}
              editable={isOwner}
            />
          </YStack>

          <YStack gap="$1.5">
            <PermissionLock locked={!isOwner} reason="Seul le propriétaire peut modifier ce champ.">
              <Text fontSize={14} fontWeight="500" color="$neutral900">
                Registre de commerce
              </Text>
            </PermissionLock>
            <FormField label="" value={rcNumber} onChangeText={setRcNumber} editable={isOwner} />
          </YStack>

          {/* Phase 10 §4.2 — verification status display. Audit fix 3b
              (Option B) adds the missing write path: owner/manager can
              request verification (request_org_verification, 0089),
              which moves the status to 'pending' — actually approving/
              rejecting the request is admin-only (apps/admin), never a
              mobile-writable action, same read-only-past-this-point
              reasoning 0075's original column comment already gave. */}
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            {verificationStatus === 'verified' && (
              <CheckCircleIcon size={16} color={color.status.success} weight="fill" />
            )}
            <Text fontSize={13.5} color="$neutral500">
              Vérification : {VERIFICATION_LABEL[verificationStatus] ?? 'Non vérifiée'}
            </Text>
            {verificationStatus === 'unverified' && canEdit && (
              <Button
                variant="secondary"
                fullWidth={false}
                onPress={requestVerification}
                loading={requestingVerification}
              >
                Demander la vérification
              </Button>
            )}
          </XStack>

          {/* Phase 10 §4.2 — legal_form / workforce_size_bracket. Local
              chip rows, not Select.tsx — see this file's own header for
              why (closed CHECK-constrained enums, not free text). */}
          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              Forme juridique
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {LEGAL_FORM_OPTIONS.map((opt) => (
                <XStack
                  key={opt.value}
                  paddingHorizontal={14}
                  paddingVertical={8}
                  borderRadius={999}
                  borderWidth={1}
                  borderColor={legalForm === opt.value ? '$accent600' : '$neutral300'}
                  backgroundColor={legalForm === opt.value ? '$accent50' : '$neutral0'}
                  onPress={canEdit ? () => setLegalForm(opt.value) : undefined}
                  accessibilityRole="button"
                >
                  <Text
                    fontSize={13.5}
                    color={legalForm === opt.value ? '$accent700' : '$neutral700'}
                    fontWeight={legalForm === opt.value ? '600' : '400'}
                  >
                    {opt.label}
                  </Text>
                </XStack>
              ))}
            </XStack>
          </YStack>

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="500" color="$neutral900">
              Taille de l&rsquo;équipe
            </Text>
            {liveWorkerCount !== null && liveWorkerCount > 0 ? (
              <Text fontSize={13} color="$neutral500">
                {displayedWorkforce} — calculé automatiquement à partir de votre équipe.
              </Text>
            ) : (
              <XStack gap="$2" flexWrap="wrap">
                {WORKFORCE_BRACKET_OPTIONS.map((opt) => (
                  <XStack
                    key={opt.value}
                    paddingHorizontal={14}
                    paddingVertical={8}
                    borderRadius={999}
                    borderWidth={1}
                    borderColor={workforceBracket === opt.value ? '$accent600' : '$neutral300'}
                    backgroundColor={workforceBracket === opt.value ? '$accent50' : '$neutral0'}
                    onPress={canEdit ? () => setWorkforceBracket(opt.value) : undefined}
                    accessibilityRole="button"
                  >
                    <Text
                      fontSize={13.5}
                      color={workforceBracket === opt.value ? '$accent700' : '$neutral700'}
                      fontWeight={workforceBracket === opt.value ? '600' : '400'}
                    >
                      {opt.label}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            )}
          </YStack>

          <FormField
            label="Zone d'intervention"
            icon={MapPinIcon}
            value={serviceArea}
            onChangeText={setServiceArea}
            editable={canEdit}
          />
          <FormField
            label="Facebook"
            value={facebookUrl}
            onChangeText={setFacebookUrl}
            editable={canEdit}
            autoCapitalize="none"
            keyboardType="url"
          />
          <FormField
            label="Instagram"
            value={instagramUrl}
            onChangeText={setInstagramUrl}
            editable={canEdit}
            autoCapitalize="none"
            keyboardType="url"
          />
          <FormField
            label="Site web"
            value={websiteUrl}
            onChangeText={setWebsiteUrl}
            editable={canEdit}
            autoCapitalize="none"
            keyboardType="url"
          />

          {extendedError && (
            <Text fontSize={13} color="$danger">
              {extendedError}
            </Text>
          )}
          {canEdit && (
            <Button
              variant="secondary"
              onPress={() => void handleSaveExtended()}
              loading={savingExtended}
            >
              Enregistrer ces informations
            </Button>
          )}

          {/* Phase 10 §4.2 — RIB, owner-only (matching matricule_fiscal/
              rc_number's own restriction). Masked display; the plaintext
              never reaches this screen — see migration 0075's header for
              the encryption decision and get_organization_rib_masked. */}
          <YStack gap="$1.5">
            <PermissionLock locked={!isOwner} reason="Seul le propriétaire peut modifier ce champ.">
              <Text fontSize={14} fontWeight="500" color="$neutral900">
                RIB
              </Text>
            </PermissionLock>
            <XStack
              backgroundColor="$neutral0"
              borderRadius="$control"
              borderWidth={1}
              borderColor="$neutral300"
              padding={14}
              justifyContent="space-between"
              alignItems="center"
              onPress={isOwner ? openRibSheet : undefined}
              accessibilityRole="button"
            >
              <Text fontSize={15} color={ribLast4 ? '$neutral900' : '$neutral500'}>
                {ribLast4 ? `•••• •••• •••• ${ribLast4}` : 'Non renseigné'}
              </Text>
              {isOwner && (
                <Text fontSize={13} color="$accent600" fontWeight="600">
                  {ribLast4 ? 'Modifier' : 'Ajouter'}
                </Text>
              )}
            </XStack>
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

      <Sheet visible={ribSheetOpen} onClose={() => setRibSheetOpen(false)} title="RIB">
        <YStack gap="$3">
          <Text fontSize={13} color="$neutral500">
            Utilisé pour les informations de paiement sur vos factures. Chiffré avant stockage —
            personne d&rsquo;autre que le propriétaire ne peut le consulter en clair.
          </Text>
          <FormField
            label="RIB"
            value={ribDraft}
            onChangeText={setRibDraft}
            keyboardType="number-pad"
          />
          {ribError && (
            <Text fontSize={13} color="$danger">
              {ribError}
            </Text>
          )}
          <Button onPress={() => void handleSaveRib()} loading={savingRib}>
            Enregistrer
          </Button>
        </YStack>
      </Sheet>
    </YStack>
  );
}
