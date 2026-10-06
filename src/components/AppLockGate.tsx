import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, AppStateStatus, Image, StyleSheet, Text, View} from 'react-native';
import PinPad from './PinPad';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {verifyPin} from '../services/pin';
import {
  getBiometryLabel,
  isBiometricUnlockEnabled,
  unlockWithBiometrics,
} from '../services/biometrics';
import {isAppLockEnabled} from '../services/appLock';

/**
 * Gates the whole app behind the vault PIN/biometric (same credential a
 * locked folder uses) when the user turns on Settings -> Security -> "Lock
 * app on open". Renders children untouched when the setting is off, so this
 * is a no-op wrapper for everyone who hasn't opted in.
 */
export default function AppLockGate({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [ready, setReady] = useState(false);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pinError, setPinError] = useState<string | undefined>();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometryLabel, setBiometryLabel] = useState<string | undefined>();
  const appState = useRef(AppState.currentState);
  // Avoids re-firing the biometric prompt on every re-render while it's
  // already up, or immediately again right after the user cancels it.
  const biometricInFlight = useRef(false);

  useEffect(() => {
    (async () => {
      const enabled = await isAppLockEnabled();
      setLockEnabled(enabled);
      setLocked(enabled);
      setBiometricEnabled(await isBiometricUnlockEnabled());
      setBiometryLabel((await getBiometryLabel()) ?? undefined);
      setReady(true);
    })();
  }, []);

  // Only a transition *into* 'background' re-locks - 'inactive' also covers
  // the OS's own biometric prompt briefly overlaying the app, which would
  // otherwise immediately re-lock the screen the user is trying to unlock.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;
      if (lockEnabled && next === 'background' && prev !== 'background') {
        setLocked(true);
        setPinError(undefined);
      }
    });
    return () => sub.remove();
  }, [lockEnabled]);

  async function tryBiometric() {
    if (biometricInFlight.current) {
      return;
    }
    biometricInFlight.current = true;
    try {
      const ok = await unlockWithBiometrics();
      if (ok) {
        setLocked(false);
      }
    } finally {
      biometricInFlight.current = false;
    }
  }

  useEffect(() => {
    if (ready && locked && biometricEnabled) {
      tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locked, biometricEnabled]);

  async function handlePinSubmit(pin: string) {
    const ok = await verifyPin(pin);
    if (ok) {
      setPinError(undefined);
      setLocked(false);
    } else {
      setPinError('Incorrect PIN, try again.');
    }
  }

  if (!ready || !lockEnabled || !locked) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.brandWrap}>
        <Image
          source={require('../assets/app-icon.png')}
          style={styles.brandIcon}
        />
        <Text style={styles.brandTitle}>Lavati Scanner</Text>
        <Text style={styles.brandSubtitle}>Locked for your privacy</Text>
      </View>
      <PinPad
        visible
        title="Enter PIN"
        subtitle="Enter your vault PIN to continue"
        error={pinError}
        onSubmit={handlePinSubmit}
        onCancel={() => {}}
        onBiometricRetry={biometricEnabled ? tryBiometric : undefined}
        biometryLabel={biometryLabel}
      />
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandWrap: {
      alignItems: 'center',
      marginBottom: 12,
    },
    brandIcon: {
      width: 64,
      height: 64,
      borderRadius: 16,
      marginBottom: 12,
    },
    brandTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    brandSubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: colors.textMuted,
    },
  });
