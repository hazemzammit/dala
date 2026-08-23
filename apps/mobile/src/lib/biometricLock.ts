import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

/**
 * apps/mobile/src/lib/biometricLock.ts
 *
 * Phase 12 (improvement-plan §6.6). "A strategic decision... optional
 * setting... not a forced gate" per the plan's own wording — implemented
 * as a per-device SecureStore flag, never a server column. This is
 * deliberate, not an oversight: a lock preference is about THIS DEVICE
 * ("require Face ID to open the app on my phone"), not about the
 * person's account — syncing it to `profiles` would mean enabling it on
 * one device silently enabled/required it on every other device the same
 * account is signed into, which is not what "optional device lock" means.
 * Same storage adapter this file's siblings already use for device-local,
 * non-syncable state (`welcome.tsx`'s `WELCOME_SEEN_KEY`), not a new
 * mechanism.
 *
 * `isBiometricAvailable()` checks BOTH hardware presence and enrollment —
 * a device can have Face ID/Touch ID hardware but no enrolled face/finger
 * (a fresh device, or a person who declined to set it up at the OS
 * level), and `authenticateAsync()` on an unenrolled device fails
 * immediately rather than falling back to a passcode prompt on some
 * platforms — surfacing the toggle as available in that state would be a
 * setting that visibly does nothing when tapped.
 */
const BIOMETRIC_LOCK_ENABLED_KEY = 'biometric_lock_enabled';

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return isEnrolled;
}

export async function getBiometricLockEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(BIOMETRIC_LOCK_ENABLED_KEY);
  return value === '1';
}

export async function setBiometricLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_LOCK_ENABLED_KEY, '1');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_LOCK_ENABLED_KEY);
  }
}

/**
 * `promptMessage` is the only string surfaced to the OS-native prompt —
 * everything else about that prompt's chrome (Cancel button label, Face
 * ID vs Touch ID framing) is the platform's own, not this app's, to
 * control.
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Déverrouillez Dala',
    cancelLabel: 'Annuler',
    disableDeviceFallback: false,
  });
  return result.success;
}
