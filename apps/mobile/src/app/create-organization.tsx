import type { OrganizationLegalForm, WorkforceSizeBracket } from '@dala/shared-types';
import { createOrganizationFullSchema } from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon,
  BuildingsIcon,
  EnvelopeIcon,
  FacebookLogoIcon,
  GlobeIcon,
  InstagramLogoIcon,
  MapPinIcon,
  PhoneIcon,
  UsersIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { setActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processLogoPhoto } from '@/lib/photoPipeline';
import { TRADE_OPTIONS } from '@/lib/pickerOptions';
import { uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/create-organization.tsx
 *
 * Extended from the original single-screen "name + trade_type" version
 * (Round 2 audit §1.9) into a 4-step wizard collecting every real,
 * user-writable field on `organizations` — per the full-org-creation-guide
 * and Hazem's answers to its §5 open questions:
 *   - RIB is never collected here (organization-settings.tsx's own
 *     "Ajouter un RIB" sheet remains the only place it's ever written).
 *   - Nothing here changes sign-up (`sign-up.tsx` / `supabase/functions/
 *     sign-up`) or `apps/web` — this screen is the entire scope of this
 *     pass.
 *   - No RPC signatures change — this is pure client-side orchestration of
 *     the four RPCs that already existed: create_organization_for_current_
 *     user (0014), update_organization_profile (0028),
 *     update_organization_extended_profile (0075), and (deliberately not
 *     used here) update_organization_rib (0075).
 *
 * TWO MODES, one screen:
 *   - CREATE (no `org_id` param): step 1 runs
 *     create_organization_for_current_user, same as before, then steps 2-4
 *     complete the newly created org.
 *   - COMPLETE-EXISTING (`org_id` param present): reached from login.tsx's
 *     post-login redirect for an account whose active org's profile is
 *     still incomplete. Step 1 is skipped entirely (the org already
 *     exists) — the wizard loads that org's current field values and
 *     starts directly on step 2, so nothing already filled in gets blanked
 *     out or asked for twice.
 *
 * SAVE-AS-YOU-GO: every step's "Continuer"/"Passer" persists the FULL
 * accumulated wizard state so far (not just that step's own fields) via
 * `update_organization_profile`/`update_organization_extended_profile` —
 * mirrors organization-settings.tsx's own handleSave/handleSaveExtended,
 * which always resave the complete field set rather than a per-field
 * diff. This guarantees that abandoning the wizard at ANY point after step
 * 1 leaves a usable org with everything typed so far actually saved, not
 * just whatever the final step's RPC call happened to include.
 *
 * Logo upload sequencing follows the guide's §1.4 hard constraint:
 * `uploadOrgFile` needs a real `org_id`, so the logo can only be picked
 * (and uploaded) from step 2 onward, never during step 1.
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

const TOTAL_STEPS = 4;

interface WizardState {
  name: string;
  tradeType: string | null;
  address: string;
  contactPhone: string;
  contactEmail: string;
  logoPath: string | null;
  legalForm: OrganizationLegalForm | null;
  matriculeFiscal: string;
  rcNumber: string;
  workforceBracket: WorkforceSizeBracket | null;
  serviceArea: string;
  facebookUrl: string;
  instagramUrl: string;
  websiteUrl: string;
}

const EMPTY_STATE: WizardState = {
  name: '',
  tradeType: null,
  address: '',
  contactPhone: '',
  contactEmail: '',
  logoPath: null,
  legalForm: null,
  matriculeFiscal: '',
  rcNumber: '',
  workforceBracket: null,
  serviceArea: '',
  facebookUrl: '',
  instagramUrl: '',
  websiteUrl: '',
};

export default function CreateOrganizationScreen() {
  const params = useLocalSearchParams<{ org_id?: string }>();
  const existingOrgId = params.org_id;
  const isCompletingExisting = !!existingOrgId;

  const toast = useToast();
  const [step, setStep] = useState(isCompletingExisting ? 2 : 1);
  const [orgId, setOrgId] = useState<string | null>(existingOrgId ?? null);
  const [form, setForm] = useState<WizardState>(EMPTY_STATE);
  const [loadingExisting, setLoadingExisting] = useState(isCompletingExisting);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const loadExisting = useCallback(async () => {
    if (!existingOrgId) return;
    const { data: org } = await supabase
      .from('organizations')
      .select(
        'name, trade_type, address, contact_phone, contact_email, logo_url, legal_form, matricule_fiscal, rc_number, workforce_size_bracket, service_area, facebook_url, instagram_url, website_url',
      )
      .eq('id', existingOrgId)
      .maybeSingle();
    if (org) {
      setForm({
        name: org.name ?? '',
        tradeType: org.trade_type ?? null,
        address: org.address ?? '',
        contactPhone: org.contact_phone ?? '',
        contactEmail: org.contact_email ?? '',
        logoPath: org.logo_url ?? null,
        legalForm: org.legal_form ?? null,
        matriculeFiscal: org.matricule_fiscal ?? '',
        rcNumber: org.rc_number ?? '',
        workforceBracket: org.workforce_size_bracket ?? null,
        serviceArea: org.service_area ?? '',
        facebookUrl: org.facebook_url ?? '',
        instagramUrl: org.instagram_url ?? '',
        websiteUrl: org.website_url ?? '',
      });
    }
    setLoadingExisting(false);
  }, [existingOrgId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  // Step 1 — Essentials. Unchanged from the original screen: same RPC,
  // same schema slice, same "no manager-vs-owner branching" reasoning
  // (the creating user is always the owner).
  async function handleCreateOrg() {
    setError(null);
    const parsed = createOrganizationFullSchema.pick({ name: true, trade_type: true }).safeParse({
      name: form.name,
      trade_type: form.tradeType ?? undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      haptics.error();
      return;
    }

    setSaving(true);
    const { data: newOrgId, error: rpcError } = await supabase.rpc(
      'create_organization_for_current_user',
      {
        p_name: parsed.data.name,
        p_trade_type: parsed.data.trade_type ?? null,
      },
    );
    setSaving(false);

    if (rpcError || !newOrgId) {
      setError(rpcError?.message ?? 'Impossible de créer l\u2019entreprise.');
      haptics.error();
      return;
    }

    setOrgId(newOrgId as string);
    await setActiveOrgId(newOrgId as string);
    haptics.confirm();
    setStep(2);
  }

  // Persists everything update_organization_profile covers, using the
  // CURRENT accumulated state — called at the end of steps 2 and 3, so
  // abandoning the wizard after either one still leaves those fields
  // saved (see this file's own header for why this resends the full set
  // rather than a per-step diff).
  async function persistProfile(): Promise<boolean> {
    if (!orgId) return false;
    const parsed = createOrganizationFullSchema
      .pick({
        name: true,
        trade_type: true,
        address: true,
        contact_phone: true,
        contact_email: true,
        matricule_fiscal: true,
        rc_number: true,
        logo_url: true,
      })
      .safeParse({
        name: form.name,
        trade_type: form.tradeType ?? undefined,
        address: form.address.trim() || undefined,
        contact_phone: form.contactPhone.trim() || undefined,
        contact_email: form.contactEmail.trim() || undefined,
        matricule_fiscal: form.matriculeFiscal.trim() || undefined,
        rc_number: form.rcNumber.trim() || undefined,
        logo_url: form.logoPath ?? undefined,
      });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return false;
    }

    const { error: rpcError } = await supabase.rpc('update_organization_profile', {
      p_org_id: orgId,
      p_name: parsed.data.name,
      p_trade_type: parsed.data.trade_type ?? null,
      p_address: parsed.data.address ?? null,
      p_contact_phone: parsed.data.contact_phone ?? null,
      p_contact_email: parsed.data.contact_email ?? null,
      p_matricule_fiscal: parsed.data.matricule_fiscal ?? null,
      p_rc_number: parsed.data.rc_number ?? null,
      p_logo_url: parsed.data.logo_url ?? null,
    });
    if (rpcError) {
      setError('Impossible d\u2019enregistrer ces informations.');
      return false;
    }
    return true;
  }

  // Persists everything update_organization_extended_profile covers —
  // called at the end of steps 3 (legal_form only, rest still null) and 4
  // (everything), same save-as-you-go reasoning as persistProfile above.
  async function persistExtendedProfile(): Promise<boolean> {
    if (!orgId) return false;
    const parsed = createOrganizationFullSchema
      .pick({
        legal_form: true,
        workforce_size_bracket: true,
        facebook_url: true,
        instagram_url: true,
        website_url: true,
        service_area: true,
      })
      .safeParse({
        legal_form: form.legalForm ?? undefined,
        workforce_size_bracket: form.workforceBracket ?? undefined,
        facebook_url: form.facebookUrl.trim(),
        instagram_url: form.instagramUrl.trim(),
        website_url: form.websiteUrl.trim(),
        service_area: form.serviceArea.trim() || undefined,
      });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return false;
    }

    const { error: rpcError } = await supabase.rpc('update_organization_extended_profile', {
      p_org_id: orgId,
      p_legal_form: parsed.data.legal_form ?? null,
      p_workforce_size_bracket: parsed.data.workforce_size_bracket ?? null,
      p_facebook_url: parsed.data.facebook_url || null,
      p_instagram_url: parsed.data.instagram_url || null,
      p_website_url: parsed.data.website_url || null,
      p_service_area: parsed.data.service_area ?? null,
    });
    if (rpcError) {
      setError('Impossible d\u2019enregistrer ces informations.');
      return false;
    }
    return true;
  }

  async function handleStep2Next() {
    setError(null);
    setSaving(true);
    const ok = await persistProfile();
    setSaving(false);
    if (!ok) {
      haptics.error();
      return;
    }
    setStep(3);
  }

  async function handleStep3Next() {
    setError(null);
    setSaving(true);
    const okProfile = await persistProfile();
    const okExtended = okProfile && (await persistExtendedProfile());
    setSaving(false);
    if (!okProfile || !okExtended) {
      haptics.error();
      return;
    }
    setStep(4);
  }

  async function handleFinish() {
    setError(null);
    setSaving(true);
    const ok = await persistExtendedProfile();
    setSaving(false);
    if (!ok) {
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success(
      isCompletingExisting ? 'Profil de l\u2019organisation mis à jour.' : 'Entreprise créée.',
    );
    // `from_wizard=1` is a one-mount marker, not a stored flag: dashboard.tsx
    // reads it to skip OnboardingChecklist's render on this single load only,
    // so a brand-new org doesn't get nudged by this wizard AND that card in
    // the same breath. It does nothing on any later dashboard visit — the
    // checklist reappears next time exactly as if this never happened.
    router.replace('/(contractor)/dashboard?from_wizard=1');
  }

  async function handleFinishLater() {
    if (orgId) await setActiveOrgId(orgId);
    router.replace('/(contractor)/dashboard?from_wizard=1');
  }

  async function handlePickLogo() {
    if (!orgId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.error('Autorisez l\u2019accès à vos photos pour ajouter un logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingLogo(true);
    try {
      const processedUri = await processLogoPhoto(result.assets[0].uri);
      const path = await uploadOrgFile(orgId, 'logo', processedUri, 'png', 'image/png');
      update('logoPath', path);
      toast.success('Logo ajouté.');
    } catch {
      toast.error('Impossible d\u2019ajouter le logo.');
      haptics.error();
    } finally {
      setUploadingLogo(false);
    }
  }

  function handleBack() {
    if (step === 1) {
      router.back();
      return;
    }
    // Non-destructive: form state lives in this one parent useState for
    // the whole wizard, so going back never clears a later step's inputs.
    // Step 1 is never revisited once the org exists (isCompletingExisting
    // or a created orgId means there's nothing left to "create").
    setStep((s) => Math.max(isCompletingExisting ? 2 : 1, s - 1));
  }

  if (loadingExisting) {
    return (
      <YStack flex={1} backgroundColor="$neutral25" justifyContent="center" alignItems="center">
        <Text color="$neutral500">Chargement…</Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} backgroundColor="$neutral25">
      <XStack paddingHorizontal="$4" paddingBottom="$3" alignItems="center" gap="$3">
        <XStack onPress={handleBack} accessibilityRole="button" accessibilityLabel="Retour">
          <ArrowLeftIcon size={20} />
        </XStack>
        <YStack flex={1}>
          <Text fontFamily="$display" fontSize={20} fontWeight="600">
            {isCompletingExisting ? 'Compléter votre profil' : 'Nouvelle entreprise'}
          </Text>
          <Text fontSize={12.5} color="$neutral500">
            Étape {step} sur {TOTAL_STEPS}
          </Text>
        </YStack>
      </XStack>

      {/* Step indicator — dots, not a field-count progress bar: steps 2-4
          are all skippable, so a bar implying "you must finish" would be
          the wrong signal (guide §2.2). */}
      <XStack paddingHorizontal="$4" paddingBottom="$3" gap="$1.5">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <XStack
            key={s}
            flex={1}
            height={4}
            borderRadius={999}
            backgroundColor={s <= step ? '$accent600' : '$neutral200'}
          />
        ))}
      </XStack>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48, gap: 16 }}
      >
        <YStack gap="$3">
          {step === 1 && (
            <>
              <Text fontSize={14} color="$neutral500">
                Vous en serez le propriétaire (owner). Vous pourrez basculer entre vos entreprises à
                tout moment depuis le sélecteur.
              </Text>
              <FormField
                label="Nom de l'entreprise"
                icon={BuildingsIcon}
                value={form.name}
                onChangeText={(v) => update('name', v)}
              />
              <Select
                label="Corps de métier (optionnel)"
                icon={BuildingsIcon}
                value={form.tradeType}
                onChange={(v) => update('tradeType', v)}
                options={TRADE_OPTIONS}
                otherLabel="Autre — préciser"
              />
              {error && <Text color="$danger">{error}</Text>}
              <Button onPress={() => void handleCreateOrg()} loading={saving}>
                Continuer
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <Text fontSize={14} color="$neutral500">
                Coordonnées de l&rsquo;entreprise — tout est facultatif, vous pourrez les compléter
                plus tard.
              </Text>
              <FormField
                label="Adresse"
                icon={MapPinIcon}
                value={form.address}
                onChangeText={(v) => update('address', v)}
              />
              <FormField
                label="Téléphone de contact"
                icon={PhoneIcon}
                value={form.contactPhone}
                onChangeText={(v) => update('contactPhone', v)}
                keyboardType="phone-pad"
              />
              <FormField
                label="E-mail de contact"
                icon={EnvelopeIcon}
                value={form.contactEmail}
                onChangeText={(v) => update('contactEmail', v)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Button
                variant="secondary"
                onPress={() => void handlePickLogo()}
                loading={uploadingLogo}
              >
                {form.logoPath ? 'Changer le logo' : 'Ajouter un logo'}
              </Button>

              {error && <Text color="$danger">{error}</Text>}
              <XStack gap="$2.5">
                <Button variant="chip" onPress={() => setStep(3)}>
                  Passer
                </Button>
                <Button flex={1} onPress={() => void handleStep2Next()} loading={saving}>
                  Continuer
                </Button>
              </XStack>
            </>
          )}

          {step === 3 && (
            <>
              <Text fontSize={14} color="$neutral500">
                Informations légales — visibles uniquement par vous et votre équipe.
              </Text>
              <YStack gap="$1.5">
                <XStack alignItems="center" gap="$1.5">
                  <BuildingsIcon size={16} color="$neutral500" />
                  <Text fontSize={14} fontWeight="500" color="$neutral900">
                    Forme juridique
                  </Text>
                </XStack>
                <XStack gap="$2" flexWrap="wrap">
                  {LEGAL_FORM_OPTIONS.map((opt) => (
                    <XStack
                      key={opt.value}
                      paddingHorizontal={14}
                      paddingVertical={8}
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={form.legalForm === opt.value ? '$accent600' : '$neutral300'}
                      backgroundColor={form.legalForm === opt.value ? '$accent50' : '$neutral0'}
                      onPress={() => update('legalForm', opt.value)}
                      accessibilityRole="button"
                    >
                      <Text
                        fontSize={13.5}
                        color={form.legalForm === opt.value ? '$accent700' : '$neutral700'}
                        fontWeight={form.legalForm === opt.value ? '600' : '400'}
                      >
                        {opt.label}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
              </YStack>

              <FormField
                label="Matricule fiscal"
                icon={BuildingsIcon}
                value={form.matriculeFiscal}
                onChangeText={(v) => update('matriculeFiscal', v)}
              />
              <FormField
                label="Registre de commerce"
                icon={BuildingsIcon}
                value={form.rcNumber}
                onChangeText={(v) => update('rcNumber', v)}
              />

              {error && <Text color="$danger">{error}</Text>}
              <XStack gap="$2.5">
                <Button variant="chip" onPress={() => setStep(4)}>
                  Passer
                </Button>
                <Button flex={1} onPress={() => void handleStep3Next()} loading={saving}>
                  Continuer
                </Button>
              </XStack>
            </>
          )}

          {step === 4 && (
            <>
              <Text fontSize={14} color="$neutral500">
                Profil public — utilisé pour votre visibilité auprès de nouveaux clients.
              </Text>
              <YStack gap="$1.5">
                <XStack alignItems="center" gap="$1.5">
                  <UsersIcon size={16} color="$neutral500" />
                  <Text fontSize={14} fontWeight="500" color="$neutral900">
                    Taille de l&rsquo;équipe
                  </Text>
                </XStack>
                <XStack gap="$2" flexWrap="wrap">
                  {WORKFORCE_BRACKET_OPTIONS.map((opt) => (
                    <XStack
                      key={opt.value}
                      paddingHorizontal={14}
                      paddingVertical={8}
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={
                        form.workforceBracket === opt.value ? '$accent600' : '$neutral300'
                      }
                      backgroundColor={
                        form.workforceBracket === opt.value ? '$accent50' : '$neutral0'
                      }
                      onPress={() => update('workforceBracket', opt.value)}
                      accessibilityRole="button"
                    >
                      <Text
                        fontSize={13.5}
                        color={form.workforceBracket === opt.value ? '$accent700' : '$neutral700'}
                        fontWeight={form.workforceBracket === opt.value ? '600' : '400'}
                      >
                        {opt.label}
                      </Text>
                    </XStack>
                  ))}
                </XStack>
              </YStack>

              <FormField
                label="Zone d'intervention"
                icon={MapPinIcon}
                value={form.serviceArea}
                onChangeText={(v) => update('serviceArea', v)}
              />
              <FormField
                label="Facebook"
                icon={FacebookLogoIcon}
                value={form.facebookUrl}
                onChangeText={(v) => update('facebookUrl', v)}
                autoCapitalize="none"
                keyboardType="url"
              />
              <FormField
                label="Instagram"
                icon={InstagramLogoIcon}
                value={form.instagramUrl}
                onChangeText={(v) => update('instagramUrl', v)}
                autoCapitalize="none"
                keyboardType="url"
              />
              <FormField
                label="Site web"
                icon={GlobeIcon}
                value={form.websiteUrl}
                onChangeText={(v) => update('websiteUrl', v)}
                autoCapitalize="none"
                keyboardType="url"
              />

              {error && <Text color="$danger">{error}</Text>}
              <XStack gap="$2.5">
                <Button variant="chip" onPress={() => void handleFinish()}>
                  Passer
                </Button>
                <Button flex={1} onPress={() => void handleFinish()} loading={saving}>
                  Terminer
                </Button>
              </XStack>
            </>
          )}

          {/* Guide §2.2 — a person can back out entirely after step 1
              since the org already exists and is usable; don't trap them
              in the wizard. */}
          {step > 1 && (
            <Text
              color="$neutral500"
              textAlign="center"
              fontSize={13}
              onPress={() => void handleFinishLater()}
            >
              Terminer plus tard
            </Text>
          )}
        </YStack>
      </ScrollView>
    </YStack>
  );
}
