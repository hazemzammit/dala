import { color } from '@dala/design-tokens';
import type { OrgRole } from '@dala/shared-types';
import {
  changePhoneSchema,
  confirmPhoneChangeSchema,
  requestEmailChangeSchema,
  updateProfileSchema,
} from '@dala/validation';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeftIcon, CameraIcon, CheckCircleIcon, XCircleIcon } from 'phosphor-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { Text, View, XStack, YStack } from 'tamagui';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { ProgressBar } from '@/components/ui/Progress';
import { Sheet } from '@/components/ui/Sheet';
import { SkeletonList } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { getActiveOrgId } from '@/lib/activeOrg';
import { haptics } from '@/lib/haptics';
import { processAvatarPhoto } from '@/lib/photoPipeline';
import { getSignedUrl, uploadOrgFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/components/profile/ProfileScreen.tsx
 *
 * IMPROVEMENT-PLAN PHASE 10 — §4.1 step 3 resolution, decided and disclosed
 * here rather than left implicit in the diff (per this phase's own Step 1
 * instruction to say plainly which way this went).
 *
 * DECISION: build the unified shape now, not bolt Phase 10's new fields
 * onto three divergent screens a second time. But the "three divergent
 * screens" framing turned out to be an overstatement once actually read
 * (Step 1): `profile-settings.tsx` is already role-agnostic — it's keyed
 * off `auth.uid()` and already serves owner/manager/viewer sessions
 * identically, since it has always just been "my own account," not a
 * contractor-specific screen. The real divergence was narrower: the
 * worker's equivalent (`(worker)/settings.tsx`'s "Profil" row) was still
 * only a thin avatar-only Sheet, not a real screen, per Phase 3's own
 * explicit deferral of this exact item.
 *
 * So the unification this component performs is: ONE component, rendered
 * as a full screen by BOTH `profile-settings.tsx` (contractor/manager/
 * viewer — unchanged route) and the new `(worker)/profile.tsx` (worker —
 * replaces the old avatar-only Sheet). `organization-settings.tsx` is
 * deliberately NOT folded in here — an organization isn't a person, and
 * §4.2's org fields already have a natural, separate home on that screen;
 * §4.1 step 3's own wording distinguishes "profile screen" (a person) from
 * the org screen throughout.
 *
 * ROLE-CONDITIONAL PIECES, DISCLOSED — this is one shared LAYOUT, not one
 * identical form:
 *   - Full name: editable for BOTH roles now (previously worker-read-only,
 *     contractor-editable). Small, deliberate widening: unifying into one
 *     component made keeping two code paths for the exact same
 *     `profiles.full_name` field, under the exact same RLS
 *     (`profiles_update_own`, id = auth.uid(), no role distinction),
 *     harder to justify than just allowing it for both. Uses infrastructure
 *     Phase 3 already built; not new backend work.
 *   - Phone / Email rows: tap-to-edit (opens the request_phone_change/
 *     confirm_phone_change RPC flow, or Supabase Auth's email-change flow)
 *     for contractor/manager/viewer ONLY — UNCHANGED from before this
 *     phase. Still a dead, non-tappable row for a worker — Phase 3's own
 *     explicit scope boundary ("Téléphone/E-mail/Sécurité/Langue remain
 *     dead rows... not touched, since only 'Profil' was named in scope")
 *     is carried forward, not silently reopened. Phase 10's own bullet
 *     list doesn't name wiring these for workers either.
 *   - Role/trade + join/hire date row: contractor/manager/viewer shows
 *     their `organization_members.role` badge + `joined_at`; a worker
 *     shows their `workers.trade` + the new `workers.hire_date` (falling
 *     back to `workers.created_at` if unset). Different underlying tables,
 *     same visual row shape.
 *   - Emergency contact: editable for BOTH roles — universal per §4.3's
 *     own framing ("if someone's hurt on site, who do we call" applies to
 *     everyone on site, not just field workers).
 *
 * DEPENDENCY FOUND WHILE BUILDING THIS SCREEN, FIXED IN THIS PHASE'S OWN
 * MIGRATION (0075), NOT DEFERRED: reading a worker's own `trade`/
 * `job_title`/`hire_date` here required a `workers` self-select RLS
 * policy that turned out not to exist anywhere in this schema — see
 * migration 0075's own Part 3a header for the full finding (it affects
 * several pre-existing worker screens, not just this one) and why it was
 * fixed here rather than flagged-and-deferred, mirroring Phase 2's own
 * `submit_site_log_entry()` precedent for exactly this situation.
 */

const CHECKLIST_LABELS = {
  avatar_url: 'une photo',
  phone: 'un numéro de téléphone',
  emergency_contact: 'un contact d\u2019urgence',
  trade: 'votre métier',
} as const;

interface WorkerSelfRow {
  trade: string | null;
  job_title: string | null;
  hire_date: string | null;
  created_at: string;
}

interface OrgMembership {
  role: OrgRole;
  joined_at: string;
}

export interface ProfileScreenProps {
  role: 'contractor' | 'worker';
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Non renseigné';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ProfileScreen({ role }: ProfileScreenProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [savingEmergency, setSavingEmergency] = useState(false);

  const [emailVerifiedAt, setEmailVerifiedAt] = useState<string | null>(null);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  const [orgMembership, setOrgMembership] = useState<OrgMembership | null>(null);
  const [workerRow, setWorkerRow] = useState<WorkerSelfRow | null>(null);

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
      .select(
        'full_name, phone, avatar_url, emergency_contact_name, emergency_contact_phone, email_verified_at, last_login_at, created_at, profile_checklist_dismissed_at',
      )
      .eq('id', session.user.id)
      .maybeSingle();

    if (profile) {
      setFullName(profile.full_name ?? '');
      setPhone(profile.phone ?? '');
      setAvatarPath(profile.avatar_url ?? null);
      if (profile.avatar_url) setAvatarSignedUrl(await getSignedUrl(profile.avatar_url));
      setEmergencyName(profile.emergency_contact_name ?? '');
      setEmergencyPhone(profile.emergency_contact_phone ?? '');
      setEmailVerifiedAt(profile.email_verified_at ?? null);
      setLastLoginAt(profile.last_login_at ?? null);
      setCreatedAt(profile.created_at ?? null);
      setChecklistDismissed(!!profile.profile_checklist_dismissed_at);
    }

    if (role === 'contractor') {
      const orgId = await getActiveOrgId();
      if (orgId) {
        const { data: membership } = await supabase
          .from('organization_members')
          .select('role, joined_at')
          .eq('org_id', orgId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (membership) setOrgMembership(membership as OrgMembership);
      }
    } else {
      // workers_select_self (migration 0075, Part 3a) — see this file's
      // own header for why this policy was missing and had to be added.
      const { data: worker } = await supabase
        .from('workers')
        .select('trade, job_title, hire_date, created_at')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (worker) setWorkerRow(worker as WorkerSelfRow);
    }

    setLoading(false);
  }

  const completion = useMemo(() => {
    const checks: Array<keyof typeof CHECKLIST_LABELS> = [
      'avatar_url',
      'phone',
      'emergency_contact',
    ];
    if (role === 'worker') checks.push('trade');

    const filled = new Set<keyof typeof CHECKLIST_LABELS>();
    if (avatarPath) filled.add('avatar_url');
    if (phone.trim()) filled.add('phone');
    if (emergencyName.trim() && emergencyPhone.trim()) filled.add('emergency_contact');
    if (role === 'worker' && workerRow?.trade) filled.add('trade');

    const missing = checks.filter((c) => !filled.has(c));
    const percent = checks.length === 0 ? 100 : Math.round((filled.size / checks.length) * 100);
    return { percent, missing };
  }, [avatarPath, phone, emergencyName, emergencyPhone, role, workerRow]);

  async function handleToggleChecklist(dismiss: boolean) {
    setChecklistDismissed(dismiss);
    const { error } = await supabase.rpc('dismiss_profile_checklist', { p_dismissed: dismiss });
    if (error) {
      // Non-fatal — revert the optimistic UI change, but don't block the
      // rest of the screen on a dismiss-toggle failure.
      setChecklistDismissed(!dismiss);
    }
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

      setAvatarPath(path);
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

  async function handleSaveEmergencyContact() {
    if (!userId) return;
    const parsed = updateProfileSchema.safeParse({
      emergency_contact_name: emergencyName.trim() || undefined,
      emergency_contact_phone: emergencyPhone.trim() || undefined,
    });
    if (!parsed.success) return;

    setSavingEmergency(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        emergency_contact_name: emergencyName.trim() || null,
        emergency_contact_phone: emergencyPhone.trim() || null,
      })
      .eq('id', userId);
    setSavingEmergency(false);
    if (error) {
      toast.error("Impossible d'enregistrer le contact d'urgence.");
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success("Contact d'urgence enregistré.");
  }

  function openPhoneSheet() {
    if (role !== 'contractor') return;
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
    if (role !== 'contractor') return;
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
        <SkeletonList rows={5} />
      </YStack>
    );
  }

  const roleLabel: Record<OrgRole, string> = {
    owner: 'Propriétaire',
    manager: 'Manager',
    viewer: 'Lecture seule',
  };

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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
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

        {/* Phase 10 §4.4 — completion signal. Dismissible; a dismissed
            checklist collapses to a single small percentage line rather
            than disappearing entirely, so the number stays honest even
            once the nudge is hidden. */}
        {!checklistDismissed && completion.percent < 100 && (
          <YStack
            backgroundColor="$neutral0"
            borderRadius="$card"
            padding="$4"
            marginBottom="$4"
            gap="$2.5"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontSize={14} fontWeight="600" color="$neutral900">
                Profil complété à {completion.percent}%
              </Text>
              <Text
                fontSize={12.5}
                color="$accent600"
                fontWeight="500"
                onPress={() => void handleToggleChecklist(true)}
                accessibilityRole="button"
              >
                Masquer
              </Text>
            </XStack>
            <ProgressBar value={completion.percent} />
            {completion.missing.length > 0 && (
              <Text fontSize={12.5} color="$neutral500">
                Ajoutez {completion.missing.map((c) => CHECKLIST_LABELS[c]).join(', ')}.
              </Text>
            )}
          </YStack>
        )}
        {checklistDismissed && completion.percent < 100 && (
          <XStack marginBottom="$4" gap="$2" alignItems="center">
            <Text fontSize={12.5} color="$neutral500">
              Profil complété à {completion.percent}%
            </Text>
            <Text
              fontSize={12.5}
              color="$accent600"
              fontWeight="500"
              onPress={() => void handleToggleChecklist(false)}
              accessibilityRole="button"
            >
              Afficher les suggestions
            </Text>
          </XStack>
        )}

        <YStack gap="$4">
          <FormField label="Nom complet" value={fullName} onChangeText={setFullName} />
          <Button variant="secondary" onPress={() => void handleSaveName()} loading={savingName}>
            Enregistrer le nom
          </Button>

          {/* Role/trade + join/hire date — same row shape, different
              source table per role (organization_members vs workers). */}
          {role === 'contractor' && orgMembership && (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$3.5" gap="$1">
              <Text fontSize={13} color="$neutral500">
                {roleLabel[orgMembership.role]} · Membre depuis{' '}
                {formatDate(orgMembership.joined_at)}
              </Text>
            </YStack>
          )}
          {role === 'worker' && workerRow && (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$3.5" gap="$1">
              <Text fontSize={13} color="$neutral500">
                {workerRow.trade ?? 'Métier non renseigné'}
                {workerRow.job_title ? ` · ${workerRow.job_title}` : ''} · Employé depuis{' '}
                {formatDate(workerRow.hire_date ?? workerRow.created_at)}
              </Text>
            </YStack>
          )}

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
              onPress={role === 'contractor' ? openPhoneSheet : undefined}
              accessibilityRole="button"
              accessibilityLabel="Modifier le téléphone"
            >
              <Text fontSize={15}>{phone || 'Ajouter un numéro'}</Text>
              {role === 'contractor' && (
                <Text fontSize={13} color="$accent600" fontWeight="600">
                  Modifier
                </Text>
              )}
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
              onPress={role === 'contractor' ? openEmailSheet : undefined}
              accessibilityRole="button"
              accessibilityLabel="Modifier l'e-mail"
            >
              <Text fontSize={15}>{email}</Text>
              {role === 'contractor' && (
                <Text fontSize={13} color="$accent600" fontWeight="600">
                  Modifier
                </Text>
              )}
            </XStack>
            {emailPending && (
              <Text fontSize={12.5} color="$neutral500">
                Un e-mail de confirmation a été envoyé à {newEmail || 'la nouvelle adresse'} et à{' '}
                {email}. Le changement prendra effet une fois confirmé.
              </Text>
            )}
          </YStack>

          {/* Phase 10 §4.3 — emergency contact, universal across both roles. */}
          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$3.5" gap="$3">
            <Text fontSize={14} fontWeight="600" color="$neutral900">
              Contact d&rsquo;urgence
            </Text>
            <FormField label="Nom" value={emergencyName} onChangeText={setEmergencyName} />
            <FormField
              label="Téléphone"
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              keyboardType="phone-pad"
            />
            <Button
              variant="secondary"
              onPress={() => void handleSaveEmergencyContact()}
              loading={savingEmergency}
            >
              Enregistrer le contact
            </Button>
          </YStack>

          {/* Phase 10 §4.4 — verification/status signals. */}
          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$3.5" gap="$2.5">
            <XStack alignItems="center" gap="$2">
              {emailVerifiedAt ? (
                <CheckCircleIcon size={16} color={color.status.success} weight="fill" />
              ) : (
                <XCircleIcon size={16} color={color.neutral[500]} />
              )}
              <Text fontSize={13.5} color="$neutral900">
                {emailVerifiedAt ? 'E-mail vérifié' : 'E-mail non vérifié'}
              </Text>
            </XStack>
            <Text fontSize={13} color="$neutral500">
              Dernière connexion : {lastLoginAt ? formatDate(lastLoginAt) : 'Non renseigné'}
            </Text>
            <Text fontSize={13} color="$neutral500">
              Compte créé le {formatDate(createdAt)}
            </Text>
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
