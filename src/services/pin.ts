import * as Keychain from 'react-native-keychain';
import { sha256Hex } from '../utils/hash';

const SERVICE = 'com.lavatiscanner.vaultpin';

export async function hasPin(): Promise<boolean> {
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  return creds !== false;
}

export async function setPin(pin: string): Promise<void> {
  await Keychain.setGenericPassword('vault_pin', sha256Hex(pin), {
    service: SERVICE,
  });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const creds = await Keychain.getGenericPassword({ service: SERVICE });
  if (!creds) return false;
  return creds.password === sha256Hex(pin);
}

export async function clearPin(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}
