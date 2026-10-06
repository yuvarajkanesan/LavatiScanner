import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_LOCK_KEY = 'lavati_app_lock_enabled';

/** Whole-app lock, separate from a folder's own lock - reuses the same
 * vault PIN/biometric credential (there's only one of each app-wide) but
 * gates the entire app on launch/resume instead of just one folder. */
export async function isAppLockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(APP_LOCK_KEY)) === 'true';
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(APP_LOCK_KEY, enabled ? 'true' : 'false');
}
