'use client';

import { Button, Card, FormField } from '@dala/ui-web';
import { PageHero } from '@dala/ui-web';
import { changePasswordSchema, totpCodeSchema } from '@dala/validation';
import { CheckCircleIcon, ShieldCheckIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';

import { ConnectedDevices } from './ConnectedDevices';

import { SectionCard } from '@/components/contractor/Screen';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { createClient } from '@/lib/supabase/client';

/**
 * apps/web/src/app/(contractor)/settings/security/SecurityView.tsx
 *
 * Gap-closure guide §1.3 (2FA chunk) — see page.tsx's header for the full
 * migration-0029 reasoning. This ports mobile's security-settings.tsx
 * enroll/verify/disable/recovery-codes flow 1:1: same RPCs
 * (`generate_mfa_recovery_codes`, `count_unused_mfa_recovery_codes`), same
 * `auth.mfa.*` calls, same `qr_code` SVG string from enroll() rendered
 * directly — no QR-generation library needed here either, same conclusion
 * mobile's own comment reached (react-native-svg's SvgXml there, a plain
 * <div dangerouslySetInnerHTML> here, since the SVG string comes from
 * Supabase Auth itself, not user input).
 */
type EnrollStep = 'qr' | 'codes';

export function SecurityView({ userEmail }: { userEmail: string }) {
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // MFA status
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [recoveryCodesRemaining, setRecoveryCodesRemaining] = useState<number | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Disable confirmation
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);

  // Enroll flow
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [enrollStep, setEnrollStep] = useState<EnrollStep>('qr');
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const loadMfaStatus = useCallback(async () => {
    setStatusLoading(true);
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    const verified = data?.totp?.find((f) => f.status === 'verified');
    setMfaEnabled(!!verified);
    setMfaFactorId(verified?.id ?? null);

    if (verified) {
      const { data: count } = await supabase.rpc('count_unused_mfa_recovery_codes');
      setRecoveryCodesRemaining(typeof count === 'number' ? count : null);
    } else {
      setRecoveryCodesRemaining(null);
    }
    setStatusLoading(false);
  }, []);

  useEffect(() => {
    void loadMfaStatus();
  }, [loadMfaStatus]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    const parsed = changePasswordSchema.safeParse({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSavingPassword(true);
    const supabase = createClient();

    if (!userEmail) {
      setSavingPassword(false);
      setPasswordError('Session invalide.');
      return;
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: parsed.data.current_password,
    });
    if (reauthError) {
      setSavingPassword(false);
      setPasswordError('Mot de passe actuel incorrect.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.new_password,
    });
    setSavingPassword(false);

    if (updateError) {
      setPasswordError('Impossible de modifier le mot de passe.');
      return;
    }

    setPasswordSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function openEnrollModal() {
    setEnrollError(null);
    setEnrollStep('qr');
    setEnrollCode('');
    setEnrollBusy(true);
    setEnrollModalOpen(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setEnrollBusy(false);

    if (error || !data) {
      setEnrollError("Impossible de démarrer l'activation.");
      return;
    }

    setEnrollFactorId(data.id);
    setQrCodeSvg(data.totp.qr_code);
    setManualSecret(data.totp.secret);
  }

  async function handleConfirmEnrollment() {
    setEnrollError(null);
    const parsed = totpCodeSchema.safeParse({ code: enrollCode });
    if (!parsed.success || !enrollFactorId) {
      setEnrollError(
        parsed.success
          ? 'Facteur introuvable.'
          : (parsed.error.issues[0]?.message ?? 'Code invalide.'),
      );
      return;
    }

    setEnrollBusy(true);
    const supabase = createClient();

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollFactorId,
    });
    if (challengeError || !challengeData) {
      setEnrollBusy(false);
      setEnrollError('Impossible de vérifier le code.');
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollFactorId,
      challengeId: challengeData.id,
      code: parsed.data.code,
    });

    if (verifyError) {
      setEnrollBusy(false);
      setEnrollError('Code incorrect. Vérifiez votre application et réessayez.');
      return;
    }

    // Verification just elevated this session to aal2 — this RPC requires
    // exactly that (migration 0029).
    const { data: codes, error: codesError } = await supabase.rpc('generate_mfa_recovery_codes');
    setEnrollBusy(false);

    if (codesError || !codes) {
      setEnrollError(
        '2FA activée, mais la génération des codes de récupération a échoué. Réessayez depuis cet écran.',
      );
      return;
    }

    setRecoveryCodes(codes as string[]);
    setEnrollStep('codes');
    setMfaEnabled(true);
    setMfaFactorId(enrollFactorId);
  }

  function finishEnrollment() {
    setEnrollModalOpen(false);
    setRecoveryCodes([]);
    void loadMfaStatus();
  }

  async function handleDisable() {
    if (!mfaFactorId) return;
    setDisabling(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    setDisabling(false);
    if (error) {
      setDisableConfirmOpen(false);
      return;
    }
    setDisableConfirmOpen(false);
    await loadMfaStatus();
  }

  async function handleRegenerateCodes() {
    const supabase = createClient();
    const { data: codes, error } = await supabase.rpc('generate_mfa_recovery_codes');
    if (error || !codes) return;
    setRecoveryCodes(codes as string[]);
    setEnrollStep('codes');
    setEnrollModalOpen(true);
  }

  return (
    <>
      <PageHero
        eyebrow="Mon compte"
        title="Sécurité"
        description="Modifiez votre mot de passe et gérez la vérification en deux étapes."
      />

      <SectionCard
        title="Mot de passe"
        description="Utilisez un mot de passe d'au moins 8 caractères."
      >
        <form onSubmit={handleChangePassword} className="flex max-w-md flex-col gap-4">
          <FormField
            label="Mot de passe actuel"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <FormField
            label="Nouveau mot de passe"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <FormField
            label="Confirmer le nouveau mot de passe"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordError && <p className="text-danger text-sm">{passwordError}</p>}
          {passwordSuccess && (
            <p className="text-success text-sm">Mot de passe modifié avec succès.</p>
          )}
          <div>
            <Button type="submit" loading={savingPassword}>
              Modifier le mot de passe
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Authentification à deux facteurs"
        description="Ajoutez une couche de sécurité supplémentaire à votre compte."
      >
        <div className="flex items-center gap-3">
          <ShieldCheckIcon size={22} className="text-neutral-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-900">
              {statusLoading ? 'Chargement…' : mfaEnabled ? 'Activée' : 'Désactivée'}
            </p>
            {mfaEnabled && recoveryCodesRemaining !== null && (
              <p className="text-sm text-neutral-500">
                {recoveryCodesRemaining} code{recoveryCodesRemaining !== 1 ? 's' : ''} de
                récupération restant{recoveryCodesRemaining !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {!statusLoading &&
            (mfaEnabled ? (
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth={false} onClick={handleRegenerateCodes}>
                  Régénérer les codes
                </Button>
                <Button
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => setDisableConfirmOpen(true)}
                >
                  Désactiver
                </Button>
              </div>
            ) : (
              <Button fullWidth={false} onClick={() => void openEnrollModal()}>
                Activer
              </Button>
            ))}
        </div>
      </SectionCard>

      {enrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card raised className="w-full max-w-sm p-6">
            {enrollStep === 'qr' ? (
              <div className="flex flex-col items-center gap-3">
                <h2 className="font-display text-lg font-semibold text-neutral-900">
                  Activer la vérification en deux étapes
                </h2>
                {qrCodeSvg ? (
                  // Trusted markup from Supabase Auth's own enroll() response,
                  // not user input — same reasoning mobile's SvgXml relies on.
                  <div
                    className="rounded-2xl bg-white p-3"
                    dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                  />
                ) : (
                  <p className="text-sm text-neutral-500">Chargement…</p>
                )}
                <p className="text-center text-sm text-neutral-500">
                  Scannez ce code avec Google Authenticator, Authy ou une application équivalente.
                  Vous pouvez aussi entrer ce code manuellement :
                </p>
                {manualSecret && (
                  <p className="select-all text-sm font-semibold text-neutral-900">
                    {manualSecret}
                  </p>
                )}
                <div className="w-full">
                  <FormField
                    label="Code à 6 chiffres"
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                  />
                </div>
                {enrollError && <p className="text-danger text-sm">{enrollError}</p>}
                <Button
                  className="w-full"
                  onClick={() => void handleConfirmEnrollment()}
                  loading={enrollBusy}
                >
                  Confirmer
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon size={18} className="text-success" />
                  <h2 className="font-display text-base font-semibold text-neutral-900">
                    Conservez ces codes en lieu sûr
                  </h2>
                </div>
                <p className="text-sm text-neutral-500">
                  Chaque code ne peut être utilisé qu&apos;une seule fois pour récupérer
                  l&apos;accès à votre compte si vous perdez votre application
                  d&apos;authentification. Ils ne seront plus affichés après avoir fermé cet écran.
                </p>
                <div className="flex flex-col gap-1.5 rounded-2xl bg-neutral-100 p-4">
                  {recoveryCodes.map((c) => (
                    <p key={c} className="select-all font-mono text-sm font-semibold">
                      {c}
                    </p>
                  ))}
                </div>
                <Button onClick={finishEnrollment}>J&apos;ai enregistré ces codes</Button>
              </div>
            )}
          </Card>
        </div>
      )}

      <ConnectedDevices />

      <ConfirmDialog
        open={disableConfirmOpen}
        title="Désactiver la vérification en deux étapes ?"
        description="Votre compte ne sera plus protégé par un code supplémentaire à la connexion."
        confirmLabel="Désactiver"
        loading={disabling}
        onConfirm={() => void handleDisable()}
        onCancel={() => setDisableConfirmOpen(false)}
      />
    </>
  );
}
