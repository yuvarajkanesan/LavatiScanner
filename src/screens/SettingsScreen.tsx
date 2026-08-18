import React, {useCallback, useMemo, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Alert from '../utils/customAlert';
import {useFocusEffect} from '@react-navigation/native';
import {TabScreenProps} from '../navigation/types';
import {APP_VERSION} from '../constants';
import {AppColors} from '../theme/colors';
import {ThemeMode, useTheme} from '../theme/ThemeContext';
import {clearPin, hasPin, setPin, verifyPin} from '../services/pin';
import {
  disableBiometricUnlock,
  enableBiometricUnlock,
  getBiometryLabel,
  isBiometricUnlockEnabled,
} from '../services/biometrics';
import {clearExportsCache, getStorageUsageBytes} from '../services/fileStorage';
import {formatBytes} from '../utils/format';
import Icon from '../components/Icon';
import PinPad from '../components/PinPad';
import ScreenBackground from '../components/ScreenBackground';

type Props = TabScreenProps<'Settings'>;

type PinFlow =
  | 'set-new'
  | 'confirm-new'
  | 'verify-before-change'
  | 'verify-before-remove'
  | null;

const THEME_OPTIONS: {key: ThemeMode; label: string; icon: string}[] = [
  {key: 'light', label: 'Light', icon: 'light-mode'},
  {key: 'dark', label: 'Dark', icon: 'dark-mode'},
  {key: 'system', label: 'System', icon: 'smartphone'},
];

export default function SettingsScreen({navigation}: Props) {
  const {colors, mode, setMode} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pinIsSet, setPinIsSet] = useState(false);
  const [storageBytes, setStorageBytes] = useState(0);
  const [pinFlow, setPinFlow] = useState<PinFlow>(null);
  const [pinError, setPinError] = useState<string | undefined>();
  const [firstPin, setFirstPin] = useState('');
  const [biometryLabel, setBiometryLabel] = useState<string | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  const load = useCallback(async () => {
    setPinIsSet(await hasPin());
    setStorageBytes(await getStorageUsageBytes());
    setBiometryLabel(await getBiometryLabel());
    setBiometricEnabled(await isBiometricUnlockEnabled());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function beginSetPin() {
    setFirstPin('');
    setPinError(undefined);
    setPinFlow('set-new');
  }

  function beginChangePin() {
    setPinError(undefined);
    setPinFlow('verify-before-change');
  }

  function beginRemovePin() {
    setPinError(undefined);
    setPinFlow('verify-before-remove');
  }

  async function handlePinSubmit(pin: string) {
    switch (pinFlow) {
      case 'set-new':
        setFirstPin(pin);
        setPinError(undefined);
        setPinFlow('confirm-new');
        return;
      case 'confirm-new':
        if (pin !== firstPin) {
          setPinError("PINs didn't match. Try again.");
          setPinFlow('set-new');
          return;
        }
        await setPin(pin);
        setPinFlow(null);
        load();
        return;
      case 'verify-before-change': {
        const ok = await verifyPin(pin);
        if (!ok) {
          setPinError('Incorrect PIN.');
          return;
        }
        setFirstPin('');
        setPinError(undefined);
        setPinFlow('set-new');
        return;
      }
      case 'verify-before-remove': {
        const ok = await verifyPin(pin);
        if (!ok) {
          setPinError('Incorrect PIN.');
          return;
        }
        await clearPin();
        if (biometricEnabled) {
          await disableBiometricUnlock();
        }
        setPinFlow(null);
        load();
        return;
      }
      default:
        return;
    }
  }

  async function handleToggleBiometric(value: boolean) {
    setBiometricBusy(true);
    if (value) {
      const {ok, error} = await enableBiometricUnlock();
      if (!ok) {
        Alert.alert(
          'Could not enable',
          `${biometryLabel ?? 'Biometric'} unlock could not be turned on.\n\n` +
            "Make sure it's set up in your phone's settings (a fingerprint or face is enrolled)." +
            (error ? `\n\nDetails: ${error}` : ''),
        );
      }
    } else {
      await disableBiometricUnlock();
    }
    setBiometricBusy(false);
    load();
  }

  function handleClearCache() {
    Alert.alert(
      'Clear cache',
      'This removes cached exported PDFs. Your saved documents are not affected.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearExportsCache();
            load();
          },
        },
      ],
    );
  }

  const pinPadCopy: Record<
    Exclude<PinFlow, null>,
    {title: string; subtitle?: string}
  > = {
    'set-new': {title: 'Set a PIN', subtitle: 'Choose a 4-digit PIN'},
    'confirm-new': {title: 'Confirm PIN', subtitle: 'Enter it again'},
    'verify-before-change': {title: 'Enter current PIN'},
    'verify-before-remove': {title: 'Enter current PIN'},
  };

  return (
    <ScreenBackground>
    <ScrollView contentContainerStyle={styles.content}>
      <Section title="Appearance">
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(option => {
            const active = mode === option.key;
            const chipContent = (
              <>
                <Icon
                  name={option.icon}
                  size={20}
                  color={active ? colors.white : colors.accent}
                />
                <Text
                  style={[
                    styles.themeChipLabel,
                    active && styles.themeChipLabelActive,
                  ]}>
                  {option.label}
                </Text>
              </>
            );
            return active ? (
              <TouchableOpacity
                key={option.key}
                style={styles.themeChipWrap}
                onPress={() => setMode(option.key)}
                activeOpacity={0.85}>
                <LinearGradient
                  colors={colors.gradientPrimary}
                  start={{x: 0, y: 0}}
                  end={{x: 1, y: 1}}
                  style={[styles.themeChip, styles.themeChipActive]}>
                  {chipContent}
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={option.key}
                style={[styles.themeChipWrap, styles.themeChip]}
                onPress={() => setMode(option.key)}
                activeOpacity={0.7}>
                {chipContent}
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      <Section title="Security">
        {pinIsSet ? (
          <>
            <Row icon="lock" label="Change PIN" onPress={beginChangePin} />
            <Row
              icon="lock-open"
              label="Remove PIN"
              onPress={beginRemovePin}
              danger
            />
          </>
        ) : (
          <Row icon="lock" label="Set vault PIN" onPress={beginSetPin} />
        )}
        {pinIsSet && biometryLabel && (
          <Row
            icon="fingerprint"
            label={`Unlock with ${biometryLabel}`}
            toggle={{
              value: biometricEnabled,
              onValueChange: handleToggleBiometric,
              busy: biometricBusy,
            }}
          />
        )}
      </Section>

      <Section title="Storage">
        <Row
          icon="sd-storage"
          label={`Used: ${formatBytes(storageBytes)}`}
          disabled
        />
        <Row
          icon="delete-sweep"
          label="Clear cache"
          onPress={handleClearCache}
        />
      </Section>

      <Section title="Legal">
        <Row
          icon="description"
          label="Terms & Conditions"
          onPress={() => navigation.navigate('TermsAndConditions')}
        />
        <Row
          icon="privacy-tip"
          label="Privacy Policy"
          onPress={() => navigation.navigate('PrivacyPolicy')}
        />
      </Section>

      <Section title="About">
        <Row icon="info-outline" label={`Version ${APP_VERSION}`} disabled />
      </Section>

      <Text style={styles.copyright}>
        © 2026 Lavati Softwares. All rights reserved.
      </Text>

      <PinPad
        visible={pinFlow !== null}
        title={pinFlow ? pinPadCopy[pinFlow].title : ''}
        subtitle={pinFlow ? pinPadCopy[pinFlow].subtitle : undefined}
        error={pinError}
        onSubmit={handlePinSubmit}
        onCancel={() => setPinFlow(null)}
      />
    </ScrollView>
    </ScreenBackground>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  disabled,
  toggle,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  danger?: boolean;
  disabled?: boolean;
  toggle?: {
    value: boolean;
    onValueChange: (value: boolean) => void;
    busy?: boolean;
  };
}) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const iconColor = danger
    ? colors.danger
    : disabled
    ? colors.textMuted
    : colors.accent;
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={disabled || (!onPress && !toggle)}
      activeOpacity={toggle ? 1 : 0.6}>
      <Icon name={icon} size={20} color={iconColor} />
      <Text
        style={[
          styles.rowLabel,
          danger && styles.rowLabelDanger,
          disabled && styles.rowLabelMuted,
        ]}>
        {label}
      </Text>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onValueChange}
          disabled={toggle.busy}
          trackColor={{true: colors.accent, false: colors.border}}
          thumbColor={colors.white}
        />
      ) : (
        onPress &&
        !disabled && (
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        )
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    content: {
      padding: 16,
      maxWidth: 600,
      width: '100%',
      alignSelf: 'center',
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
      marginLeft: 4,
    },
    sectionBody: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 1},
      shadowOpacity: 0.08,
      shadowRadius: 5,
    },
    themeRow: {
      flexDirection: 'row',
      gap: 10,
    },
    themeChipWrap: {
      flex: 1,
      borderRadius: 12,
      overflow: 'hidden',
    },
    themeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeChipActive: {
      borderWidth: 0,
      elevation: 3,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: 0.2,
      shadowRadius: 4,
    },
    themeChipLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.accent,
    },
    themeChipLabelActive: {
      color: colors.white,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    rowLabelDanger: {
      color: colors.danger,
    },
    rowLabelMuted: {
      color: colors.textMuted,
    },
    copyright: {
      marginTop: 4,
      marginBottom: 16,
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
