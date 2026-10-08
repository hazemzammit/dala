'use client';

import type { OrgRole } from '@dala/shared-types';
import { Avatar, Button, Card, FormField, StatusBadge } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { changePhoneSchema, requestEmailChangeSchema } from '@dala/validation';
import { CameraIcon, UserIcon, XIcon } from '@phosphor-icons/react';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { SectionCard } from '@/components/contractor/Screen';
import { createClient } from '@/lib/supabase/client';
import { useAsyncTransition } from '@/lib/useAsyncTransition';

import {
  confirmPhoneChange,
  dismissProfileChecklist,
  requestPhoneChange,
  updateAvatarPath,
  updateEmergencyContact,
  updateProfileName,
} from './actions';
import { AvatarCropperModal } from './AvatarCropperModal';

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Propriétaire',
  manager: 'Manager',
  viewer: 'Lecture seule',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Non renseigné';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface AccountFormProps {
  email: string;
  fullName: string;
  phone: string | null;
  avatarPath: string | null;
  avatarSignedUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  checklistDismissed: boolean;
  orgRole: OrgRole | null;
  joinedAt: string | null;
  activeOrgId: string;
}

/**
 * apps/web/src/app/(contractor)/settings/account/AccountForm.tsx
 *
 * Gap-closure guide §1.3 — web port of ProfileScreen.tsx's contractor
 * branch. Same completion checklist fields (avatar/phone/emergency
 * contact), same tap-to-edit phone/email flows, same RPCs.
 */
export function AccountForm({
  email,
  fullName: initialFullName,
  phone: initialPhone,
  avatarPath: initialAvatarPath,
  avatarSignedUrl: initialAvatarSignedUrl,
  emergencyContactName,
  emergencyContactPhone,
  emailVerifiedAt,
  lastLoginAt,
  createdAt,
  checklistDismissed: initialChecklistDismissed,
  orgRole,
  joinedAt,
  activeOrgId,
}: AccountFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useAsyncTransition();

  const [fullName, setFullName] = useState(initialFullName);
  const [nameNotice, setNameNotice] = useState<string | null>(null);

  const [avatarPath, setAvatarPath] = useState(initialAvatarPath);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState(initialAvatarSignedUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);

  const [emergencyName, setEmergencyName] = useState(emergencyContactName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(emergencyContactPhone ?? '');
  const [emergencyNotice, setEmergencyNotice] = useState<string | null>(null);

  const [checklistDismissed, setChecklistDismissed] = useState(initialChecklistDismissed);

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'enter' | 'confirm'>('enter');
  const [newPhone, setNewPhone] = useState(initialPhone ?? '');
  const [phone, setPhone] = useState(initialPhone ?? '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState(false);

  const checks: Array<'avatar' | 'phone' | 'emergency'> = ['avatar', 'phone', 'emergency'];
  const filled = new Set<'avatar' | 'phone' | 'emergency'>();
  if (avatarPath) filled.add('avatar');
  if (phone.trim()) filled.add('phone');
  if (emergencyName.trim() && emergencyPhone.trim()) filled.add('emergency');
  const completionPercent = Math.round((filled.size / checks.length) * 100);

  function handleToggleChecklist(dismiss: boolean) {
    setChecklistDismissed(dismiss);
    startTransition(async () => {
      const result = await dismissProfileChecklist(dismiss);
      if (!result.success) setChecklistDismissed(!dismiss);
    });
  }

  function handleSaveName() {
    setNameNotice(null);
    if (fullName.trim().length < 2) return;
    startTransition(async () => {
      const result = await updateProfileName(fullName);
      setNameNotice(result.success ? 'Nom mis à jour.' : result.error);
    });
  }

  function handleSaveEmergencyContact() {
    setEmergencyNotice(null);
    startTransition(async () => {
      const result = await updateEmergencyContact({ name: emergencyName, phone: emergencyPhone });
      setEmergencyNotice(result.success ? "Contact d'urgence enregistré." : result.error);
    });
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Veuillez sélectionner une image valide.');
      return;
    }
    setAvatarError(null);
    // §2.6 — opens the crop step instead of uploading directly; the
    // cropper's own canvas draw does the square-crop/resize/encode, so no
    // browser-image-compression call happens on this path at all.
    setCropperFile(file);
  }

  async function handleCroppedAvatar(croppedFile: File) {
    setCropperFile(null);
    setUploadingAvatar(true);
    try {
      const filename = `${crypto.randomUUID()}.jpg`;
      const storagePath = `${activeOrgId}/avatars/${filename}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('org-files')
        .upload(storagePath, croppedFile, {
          contentType: 'image/jpeg',
          upsert: false,
        });
      if (uploadError) {
        setAvatarError("Impossible d'envoyer la photo.");
        return;
      }

      const result = await updateAvatarPath(storagePath);
      if (!result.success) {
        setAvatarError(result.error);
        return;
      }

      const { data: signed } = await supabase.storage
        .from('org-files')
        .createSignedUrl(storagePath, 3600);
      setAvatarPath(storagePath);
      setAvatarSignedUrl(signed?.signedUrl ?? null);
    } catch {
      setAvatarError("Impossible de mettre à jour l'avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function openPhoneModal() {
    setNewPhone(phone);
    setPhoneStep('enter');
    setPhoneCode('');
    setPhoneError(null);
    setPhoneModalOpen(true);
  }

  function handleRequestPhoneCode() {
    setPhoneError(null);
    const parsed = changePhoneSchema.safeParse({ new_phone: newPhone.trim() });
    if (!parsed.success) {
      setPhoneError(parsed.error.issues[0]?.message ?? 'Numéro invalide.');
      return;
    }
    startTransition(async () => {
      const result = await requestPhoneChange(parsed.data.new_phone);
      if (!result.success) {
        setPhoneError(result.error);
        return;
      }
      setPhoneStep('confirm');
    });
  }

  function handleConfirmPhoneCode() {
    setPhoneError(null);
    if (phoneCode.trim().length !== 6) {
      setPhoneError('Le code doit contenir 6 chiffres.');
      return;
    }
    startTransition(async () => {
      const result = await confirmPhoneChange(phoneCode.trim());
      if (!result.success) {
        setPhoneError(result.error);
        return;
      }
      setPhone(newPhone.trim());
      setPhoneModalOpen(false);
    });
  }

  function openEmailModal() {
    setNewEmail('');
    setEmailError(null);
    setEmailModalOpen(true);
  }

  async function handleRequestEmailChange() {
    setEmailError(null);
    const parsed = requestEmailChangeSchema.safeParse({ new_email: newEmail.trim() });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message ?? 'E-mail invalide.');
      return;
    }
    // Auth SDK call tied to the current session — must run through the
    // browser client directly, not a server action (see actions.ts header).
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: parsed.data.new_email });
    if (error) {
      setEmailError("Impossible d'envoyer la confirmation.");
      return;
    }
    setEmailPending(true);
    setEmailModalOpen(false);
  }

  return (
    <>
      <PageHero
        icon={UserIcon}
        title="Profil"
        description="Vos informations personnelles, votre rôle dans l'organisation, et votre contact d'urgence."
      />

      {!checklistDismissed && completionPercent < 100 && (
        <Card className="p-5" raised>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-900">
              Profil complété à {completionPercent}%
            </p>
            <button
              onClick={() => handleToggleChecklist(true)}
              className="text-accent-600 text-sm font-medium"
            >
              Masquer
            </button>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="bg-accent-600 h-full rounded-full transition-all"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </Card>
      )}

      <SectionCard
        title="Photo et nom"
        description="Visible par les membres de votre organisation."
      >
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar name={fullName || 'U'} imageUrl={avatarSignedUrl ?? undefined} size={72} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-accent-600 absolute -bottom-1 -right-1 rounded-full p-1.5 text-white"
              aria-label="Changer la photo de profil"
              disabled={uploadingAvatar}
            >
              <CameraIcon size={14} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <FormField
              label="Nom complet"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {uploadingAvatar && <p className="text-xs text-neutral-500">Envoi de la photo…</p>}
            {avatarError && <p className="text-danger text-xs">{avatarError}</p>}
            {nameNotice && (
              <p
                className={`text-xs ${nameNotice.includes('mis à jour') ? 'text-success' : 'text-danger'}`}
              >
                {nameNotice}
              </p>
            )}
            <div>
              <Button
                variant="secondary"
                fullWidth={false}
                onClick={handleSaveName}
                loading={isPending}
              >
                Enregistrer le nom
              </Button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Coordonnées" description="Téléphone et e-mail liés à votre compte.">
        <div className="flex flex-col divide-y divide-neutral-100">
          <button
            onClick={openPhoneModal}
            className="flex items-center justify-between py-3 text-start"
          >
            <div>
              <p className="text-sm font-medium text-neutral-900">Téléphone</p>
              <p className="text-sm text-neutral-500">{phone || 'Non renseigné'}</p>
            </div>
            <span className="text-accent-600 text-sm font-medium">Modifier</span>
          </button>
          <button
            onClick={openEmailModal}
            className="flex items-center justify-between py-3 text-start"
          >
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm font-medium text-neutral-900">E-mail</p>
                <p className="text-sm text-neutral-500">{email}</p>
              </div>
              {emailVerifiedAt ? (
                <StatusBadge variant="success">Vérifié</StatusBadge>
              ) : (
                <StatusBadge variant="warning">Non vérifié</StatusBadge>
              )}
            </div>
            <span className="text-accent-600 text-sm font-medium">Modifier</span>
          </button>
        </div>
        {emailPending && (
          <p className="text-accent-600 mt-2 text-xs">
            Vérifiez votre boîte mail (ancienne et nouvelle adresse) pour confirmer le changement.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Contact d'urgence"
        description="Qui contacter en cas de blessure ou d'urgence sur un chantier."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Nom du contact"
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
          />
          <FormField
            label="Téléphone du contact"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
          />
        </div>
        {emergencyNotice && (
          <p
            className={`mt-2 text-xs ${emergencyNotice.includes('enregistré') ? 'text-success' : 'text-danger'}`}
          >
            {emergencyNotice}
          </p>
        )}
        <div className="mt-3">
          <Button
            variant="secondary"
            fullWidth={false}
            onClick={handleSaveEmergencyContact}
            loading={isPending}
          >
            Enregistrer
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Organisation"
        description="Votre rôle et votre historique dans cette organisation."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Rôle
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              {orgRole ? ROLE_LABEL[orgRole] : 'Non renseigné'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Membre depuis
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900">{formatDate(joinedAt)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Dernière connexion
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900">{formatDate(lastLoginAt)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">Compte créé le {formatDate(createdAt)}.</p>
        {orgRole === 'owner' && (
          <Link
            href="/organizations"
            className="text-accent-600 mt-3 inline-block text-sm font-medium"
          >
            Vue d&apos;ensemble multi-organisation →
          </Link>
        )}
      </SectionCard>

      <SectionCard title="Zone sensible" description="Actions irréversibles sur votre compte.">
        <div className="flex flex-col gap-2">
          <Link href="/settings/data-export" className="text-accent-600 text-sm font-medium">
            Exporter mes données
          </Link>
          <Link href="/settings/delete-account" className="text-danger text-sm font-medium">
            Supprimer mon compte
          </Link>
        </div>
      </SectionCard>

      {phoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="w-full max-w-sm p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-neutral-900">
                {phoneStep === 'enter' ? 'Modifier le téléphone' : 'Confirmer le code'}
              </h2>
              <button
                onClick={() => setPhoneModalOpen(false)}
                className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <XIcon size={18} />
              </button>
            </div>
            {phoneStep === 'enter' ? (
              <div className="flex flex-col gap-4">
                <FormField
                  label="Nouveau numéro"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+216 ..."
                />
                {phoneError && <p className="text-danger text-sm">{phoneError}</p>}
                <Button onClick={handleRequestPhoneCode} loading={isPending}>
                  Envoyer le code
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-neutral-500">
                  Un code à 6 chiffres a été envoyé au {newPhone}.
                </p>
                <FormField
                  label="Code de vérification"
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  maxLength={6}
                />
                {phoneError && <p className="text-danger text-sm">{phoneError}</p>}
                <Button onClick={handleConfirmPhoneCode} loading={isPending}>
                  Confirmer
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="w-full max-w-sm p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-neutral-900">
                Modifier l&apos;e-mail
              </h2>
              <button
                onClick={() => setEmailModalOpen(false)}
                className="rounded-control p-1.5 text-neutral-500 hover:bg-neutral-100"
                aria-label="Fermer"
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <FormField
                label="Nouvel e-mail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              {emailError && <p className="text-danger text-sm">{emailError}</p>}
              <p className="text-xs text-neutral-500">
                Vous devrez confirmer ce changement depuis l&apos;ancienne et la nouvelle adresse.
              </p>
              <Button onClick={() => void handleRequestEmailChange()}>
                Envoyer la confirmation
              </Button>
            </div>
          </Card>
        </div>
      )}

      {cropperFile && (
        <AvatarCropperModal
          file={cropperFile}
          onCancel={() => setCropperFile(null)}
          onCropped={(cropped) => void handleCroppedAvatar(cropped)}
        />
      )}
    </>
  );
}
