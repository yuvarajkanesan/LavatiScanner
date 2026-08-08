import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  error?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  onBiometricRetry?: () => void;
  biometryLabel?: string;
}

export default function PinPad({
  visible,
  title,
  subtitle,
  error,
  onSubmit,
  onCancel,
  onBiometricRetry,
  biometryLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [pin, setPin] = useState('');

  function handleKey(key: string) {
    if (key === '') return;
    if (key === 'del') {
      setPin(prev => prev.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      onSubmit(next);
      setPin('');
    }
  }

  function handleCancel() {
    setPin('');
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          {onBiometricRetry && (
            <TouchableOpacity style={styles.biometricBtn} onPress={onBiometricRetry}>
              <Icon name="fingerprint" size={22} color={colors.accent} />
              <Text style={styles.biometricText}>Use {biometryLabel ?? 'Biometrics'}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.dots}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < pin.length && styles.dotFilled]}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.keypad}>
            {KEYS.map((key, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.key, key !== '' && styles.keyFilled]}
                disabled={key === ''}
                activeOpacity={0.6}
                onPress={() => handleKey(key)}>
                {key === 'del' ? (
                  <Icon name="backspace" size={20} color={colors.text} />
                ) : (
                  <Text style={styles.keyText}>{key}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '86%',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textMuted,
  },
  biometricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.accentMuted,
  },
  biometricText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  dots: {
    flexDirection: 'row',
    gap: 14,
    marginVertical: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  dotFilled: {
    backgroundColor: colors.accent,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    marginBottom: 10,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 220,
    justifyContent: 'center',
  },
  key: {
    width: 64,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyFilled: {
    borderRadius: 28,
    backgroundColor: colors.background,
    margin: 4,
  },
  keyText: {
    fontSize: 22,
    color: colors.text,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  cancelText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
});
