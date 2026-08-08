import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BIO_SERVICE = 'com.lavatiscanner.vaultbiometric';
const BIO_FLAG_KEY = 'lavati_biometric_enabled';

const BIOMETRY_LABELS: Record<string, string> = {
  [Keychain.BIOMETRY_TYPE.FACE_ID]: 'Face ID',
  [Keychain.BIOMETRY_TYPE.OPTIC_ID]: 'Optic ID',
  [Keychain.BIOMETRY_TYPE.TOUCH_ID]: 'Touch ID',
  [Keychain.BIOMETRY_TYPE.FINGERPRINT]: 'Fingerprint',
  [Keychain.BIOMETRY_TYPE.FACE]: 'Face Unlock',
  [Keychain.BIOMETRY_TYPE.IRIS]: 'Iris Unlock',
};

/** Returns a friendly label ("Fingerprint", "Face ID", ...) or null if the device has no biometric hardware/enrollment. */
export async function getBiometryLabel(): Promise<string | null> {
  try {
    const type = await Keychain.getSupportedBiometryType();
    if (!type) return null;
    return BIOMETRY_LABELS[type] ?? 'Biometrics';
  } catch (error) {
    return null;
  }
}

export async function isBiometricUnlockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BIO_FLAG_KEY)) === 'true';
}

/**
 * Registers a biometry-gated keychain entry. Tries BIOMETRY_ANY first (pure
 * fingerprint/face); if the device rejects that (some OEMs require a device
 * passcode as fallback to be allowed at all), retries with
 * BIOMETRY_ANY_OR_DEVICE_PASSCODE. Returns the underlying error message on
 * failure so the caller can show the real reason instead of a generic one.
 */
export async function enableBiometricUnlock(): Promise<{ ok: boolean; error?: string }> {
  const attempts: Keychain.ACCESS_CONTROL[] = [
    Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
    Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
  ];

  let lastError: unknown;
  for (const accessControl of attempts) {
    try {
      const result = await Keychain.setGenericPassword('vault_biometric', 'unlocked', {
        service: BIO_SERVICE,
        accessControl,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
      });
      if (result) {
        await AsyncStorage.setItem(BIO_FLAG_KEY, 'true');
        return { ok: true };
      }
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'Unknown error');
  return { ok: false, error: message };
}

export async function disableBiometricUnlock(): Promise<void> {
  await Keychain.resetGenericPassword({ service: BIO_SERVICE });
  await AsyncStorage.setItem(BIO_FLAG_KEY, 'false');
}

/** Triggers the OS biometric prompt. Resolves true only on a real successful authentication. */
export async function unlockWithBiometrics(): Promise<boolean> {
  try {
    const creds = await Keychain.getGenericPassword({
      service: BIO_SERVICE,
      authenticationPrompt: { title: 'Unlock Vault', cancel: 'Use PIN instead' },
    });
    return creds !== false;
  } catch (error) {
    return false;
  }
}
