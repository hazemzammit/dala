import { color } from '@dala/design-tokens';
import { changePasswordSchema, totpCodeSchema } from '@dala/validation';
import { router, useFocusEffect } from 'expo-router';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FingerprintIcon,
  ShieldCheckIcon,
} from 'phosphor-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { Toggle } from '@/components/ui/Toggle';
import {
  getBiometricLockEnabled,
  isBiometricAvailable,
  setBiometricLockEnabled,
} from '@/lib/biometricLock';
import { haptics } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

/**
 * apps/mobile/src/app/(contractor)/security-settings.tsx
 *
 * Phase 7 — password change (Doc 03 §3.22.4).
 * Phase 8 — real 2FA management (Doc 01 §1.15), replacing the disabled
 * "not built yet" row. Uses Supabase Auth's own native TOTP MFA
 * (auth.mfa.enroll/challenge/verify/unenroll) rather than a custom column
 * — see migration 0029's header for the full reasoning (Platform Admin's
 * existing totp_secret column is plain-text and can't make a client-side
 * check enforceable the way a server-issued `aal` claim can).
 *
 * `qr_code` from enroll() is already a ready-to-render SVG string —
 * react-native-svg's SvgXml renders it directly, no QR-generation library
 * needed (confirmed by reading @supabase/auth-js's own type definitions
 * before reaching for a new dependency).
 */
export default function SecuritySettingsScreen() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [recoveryCodesRemaining, setRecoveryCodesRemaining] = useState<number | null>(null);
  // Themed ConfirmDialog replacing Alert.alert's destructive two-button
  // variant — disabling 2FA is security-relevant enough to keep as an
  // interrupting confirm, just re-themed rather than the bare OS dialog.
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const [enrollSheetOpen, setEnrollSheetOpen] = useState(false);
  const [enrollStep, setEnrollStep] = useState<'qr' | 'codes'>('qr');
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null);
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollBusy, setEnrollBusy] = useState(false);

  // Phase 12 (improvement-plan §6.6) — biometric app lock. Device-local
  // only (SecureStore), see lib/biometricLock.ts's own header for why
  // this deliberately never touches `profiles`/organizations tables.
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setBiometricAvailable(await isBiometricAvailable());
      setBiometricEnabled(await getBiometricLockEnabled());
    })();
  }, []);

  async function handleToggleBiometric(next: boolean) {
    setBiometricBusy(true);
    await setBiometricLockEnabled(next);
    setBiometricEnabled(next);
    setBiometricBusy(false);
    haptics.confirm();
    toast.success(
      next ? 'Verrouillage biométrique activé.' : 'Verrouillage biométrique désactivé.',
    );
  }
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      void loadMfaStatus();
    }, []),
  );

  async function loadMfaStatus() {
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
  }

  async function handleChangePassword() {
    setError(null);
    setSuccess(false);

    const parsed = changePasswordSchema.safeParse({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide.');
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setSaving(false);
      setError('Session invalide.');
      return;
    }

    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: parsed.data.current_password,
    });
    if (reauthError) {
      setSaving(false);
      setError('Mot de passe actuel incorrect.');
      haptics.error();
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: parsed.data.new_password,
    });
    setSaving(false);

    if (updateError) {
      setError('Impossible de modifier le mot de passe.');
      haptics.error();
      return;
    }

    haptics.confirm();
    setSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  async function openEnrollSheet() {
    setEnrollError(null);
    setEnrollStep('qr');
    setEnrollCode('');
    setEnrollBusy(true);
    setEnrollSheetOpen(true);

    const { data, error: enrollError_ } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setEnrollBusy(false);

    if (enrollError_ || !data) {
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
      haptics.error();
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

    haptics.confirm();
    setRecoveryCodes(codes as string[]);
    setEnrollStep('codes');
    setMfaEnabled(true);
    setMfaFactorId(enrollFactorId);
  }

  function finishEnrollment() {
    setEnrollSheetOpen(false);
    setRecoveryCodes([]);
    void loadMfaStatus();
  }

  function confirmDisable() {
    setDisableConfirmOpen(true);
  }

  async function handleDisable() {
    if (!mfaFactorId) return;
    setDisabling(true);
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
    setDisabling(false);
    if (unenrollError) {
      toast.error(
        'Impossible de désactiver la vérification en deux étapes. Reconnectez-vous et réessayez.',
      );
      haptics.error();
      return;
    }
    haptics.confirm();
    toast.success('Vérification en deux étapes désactivée.');
    setDisableConfirmOpen(false);
    await loadMfaStatus();
  }

  async function handleRegenerateCodes() {
    const { data: codes, error: codesError } = await supabase.rpc('generate_mfa_recovery_codes');
    if (codesError || !codes) {
      toast.error(
        'Reconnectez-vous (avec vérification en deux étapes) puis réessayez — la régénération nécessite une session vérifiée.',
      );
      return;
    }
    haptics.confirm();
    setRecoveryCodes(codes as string[]);
    setEnrollStep('codes');
    setEnrollSheetOpen(true);
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
          Sécurité
        </Text>
      </XStack>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <YStack gap="$4">
          <Text fontSize={15} fontWeight="600">
            Modifier le mot de passe
          </Text>

          <FormField
            label="Mot de passe actuel"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
          />
          <FormField
            label="Nouveau mot de passe"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <FormField
            label="Confirmer le nouveau mot de passe"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />

          {error && (
            <Text fontSize={13} color="$danger">
              {error}
            </Text>
          )}
          {success && (
            <Text fontSize={13} color="$success">
              Mot de passe modifié avec succès.
            </Text>
          )}

          <Button onPress={() => void handleChangePassword()} loading={saving}>
            Modifier le mot de passe
          </Button>

          <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
            <XStack alignItems="center" gap="$3">
              <ShieldCheckIcon size={20} />
              <YStack flex={1}>
                <Text fontSize={15}>Authentification à deux facteurs</Text>
                <Text fontSize={12.5} color="$neutral500">
                  {mfaEnabled
                    ? `Activée${recoveryCodesRemaining !== null ? ` · ${recoveryCodesRemaining} codes de récupération restants` : ''}`
                    : 'Désactivée'}
                </Text>
              </YStack>
            </XStack>

            {mfaEnabled ? (
              <YStack gap="$2">
                <Button variant="secondary" onPress={() => void handleRegenerateCodes()}>
                  Régénérer les codes de récupération
                </Button>
                <Button
                  testID="security-2fa-disable-button"
                  variant="secondary"
                  onPress={confirmDisable}
                >
                  Désactiver
                </Button>
              </YStack>
            ) : (
              <Button testID="security-2fa-enable-button" onPress={() => void openEnrollSheet()}>
                Activer
              </Button>
            )}
          </YStack>

          {/* Phase 12 (improvement-plan §6.6) — optional, opt-in, not a
              forced gate. Hidden entirely (not shown disabled) when the
              device has no usable biometric enrollment — see
              lib/biometricLock.ts's isBiometricAvailable() for why. */}
          {biometricAvailable && (
            <YStack backgroundColor="$neutral0" borderRadius="$card" padding="$4" gap="$3">
              <XStack alignItems="center" gap="$3">
                <FingerprintIcon size={20} />
                <YStack flex={1}>
                  <Text fontSize={15}>Verrouillage biométrique</Text>
                  <Text fontSize={12.5} color="$neutral500">
                    Exiger Face ID / Touch ID pour rouvrir l&apos;application sur cet appareil.
                  </Text>
                </YStack>
                <Toggle
                  value={biometricEnabled}
                  onChange={(v) => void handleToggleBiometric(v)}
                  disabled={biometricBusy}
                  accessibilityLabel="Verrouillage biométrique"
                />
              </XStack>
            </YStack>
          )}
        </YStack>
      </ScrollView>

      <Sheet
        visible={enrollSheetOpen}
        onClose={() => setEnrollSheetOpen(false)}
        title={
          enrollStep === 'qr' ? 'Activer la vérification en deux étapes' : 'Codes de récupération'
        }
      >
        {enrollStep === 'qr' ? (
          <YStack gap="$3" alignItems="center">
            {qrCodeSvg ? (
              <YStack backgroundColor="$neutral0" padding="$3" borderRadius="$card">
                <SvgXml xml={qrCodeSvg} width={200} height={200} />
              </YStack>
            ) : (
              <Text fontSize={14} color="$neutral500">
                Chargement…
              </Text>
            )}

            <Text fontSize={13} color="$neutral500" textAlign="center">
              Scannez ce code avec Google Authenticator, Authy ou une application équivalente. Vous
              pouvez aussi entrer ce code manuellement :
            </Text>
            {manualSecret && (
              <Text testID="security-2fa-manual-secret" fontSize={13} fontWeight="600" selectable>
                {manualSecret}
              </Text>
            )}

            <FormField
              testID="security-2fa-enroll-code-input"
              label="Code à 6 chiffres"
              value={enrollCode}
              onChangeText={setEnrollCode}
              keyboardType="number-pad"
            />

            {enrollError && (
              <Text fontSize={13} color="$danger">
                {enrollError}
              </Text>
            )}

            <Button
              testID="security-2fa-confirm-enroll-button"
              onPress={() => void handleConfirmEnrollment()}
              loading={enrollBusy}
            >
              Confirmer
            </Button>
          </YStack>
        ) : (
          <YStack gap="$3">
            <XStack alignItems="center" gap="$2">
              <CheckCircleIcon size={18} color={color.status.success} />
              <Text fontSize={14} fontWeight="600">
                Conservez ces codes en lieu sûr
              </Text>
            </XStack>
            <Text fontSize={13} color="$neutral500">
              Chaque code ne peut être utilisé qu'une seule fois pour récupérer l'accès à votre
              compte si vous perdez votre application d'authentification. Ils ne seront plus
              affichés après avoir fermé cet écran.
            </Text>
            <YStack backgroundColor="$neutral100" borderRadius="$card" padding="$4" gap="$1.5">
              {recoveryCodes.map((c) => (
                <Text key={c} fontSize={15} fontWeight="600" selectable>
                  {c}
                </Text>
              ))}
            </YStack>
            <Button testID="security-2fa-codes-continue-button" onPress={finishEnrollment}>
              J&apos;ai enregistré ces codes
            </Button>
          </YStack>
        )}
      </Sheet>

      <ConfirmDialog
        visible={disableConfirmOpen}
        title="Désactiver la vérification en deux étapes ?"
        description="Votre compte ne sera plus protégé par un code supplémentaire à la connexion."
        confirmLabel="Désactiver"
        loading={disabling}
        onConfirm={() => void handleDisable()}
        onCancel={() => setDisableConfirmOpen(false)}
      />
    </YStack>
  );
}
