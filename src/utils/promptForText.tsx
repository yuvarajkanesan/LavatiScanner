import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from 'react-native';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface PendingRequest {
  title: string;
  initialValue: string;
  resolve: (value: string | null) => void;
}

let setPendingRequest: ((req: PendingRequest | null) => void) | null = null;

/**
 * Cross-platform "prompt for a single line of text" helper. iOS gets the
 * native Alert.prompt; Android renders a small modal via TextPromptHost
 * (Android's Alert API has no text-input variant).
 */
export function promptForText(
  title: string,
  initialValue = '',
): Promise<string | null> {
  if (Platform.OS === 'ios') {
    return new Promise(resolve => {
      Alert.prompt(
        title,
        undefined,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          { text: 'OK', onPress: text => resolve(text ?? null) },
        ],
        'plain-text',
        initialValue,
      );
    });
  }

  return new Promise(resolve => {
    if (!setPendingRequest) {
      resolve(null);
      return;
    }
    setPendingRequest({ title, initialValue, resolve });
  });
}

export function TextPromptHost() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  setPendingRequest = req => {
    setRequest(req);
    setValue(req?.initialValue ?? '');
    setTouched(false);
  };

  if (!request) return null;

  function close(result: string | null) {
    request?.resolve(result);
    setRequest(null);
  }

  const isValid = value.trim().length > 0;

  function handleOk() {
    if (!isValid) {
      setTouched(true);
      return;
    }
    close(value.trim());
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(null)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{request.title}</Text>
          <TextInput
            style={[styles.input, touched && !isValid && styles.inputInvalid]}
            value={value}
            onChangeText={text => {
              setValue(text);
              if (touched) setTouched(false);
            }}
            autoFocus
            selectTextOnFocus
            placeholderTextColor={colors.textMuted}
          />
          {touched && !isValid && (
            <Text style={styles.errorText}>Name can't be empty</Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => close(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.okBtn, !isValid && styles.okBtnDisabled]}
              onPress={handleOk}>
              <Text style={styles.okText}>OK</Text>
            </TouchableOpacity>
          </View>
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
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 22,
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
    marginBottom: 14,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputInvalid: {
    borderColor: colors.danger,
  },
  errorText: {
    marginTop: 6,
    fontSize: 12.5,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 18,
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  cancelText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
  okBtn: {
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  okBtnDisabled: {
    opacity: 0.4,
  },
  okText: {
    fontSize: 14,
    color: colors.white,
    fontWeight: '700',
  },
});
