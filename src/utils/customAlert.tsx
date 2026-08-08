import React, {useMemo, useState} from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

export interface CustomAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface CustomAlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}

interface PendingAlert {
  title: string;
  message?: string;
  buttons: CustomAlertButton[];
  cancelable: boolean;
  onDismiss?: () => void;
}

let setPendingAlert: ((req: PendingAlert | null) => void) | null = null;

/**
 * Drop-in replacement for RN's `Alert.alert` with the app's own themed
 * modal instead of the bare OS dialog. Same signature, so call sites just
 * swap the import — `import Alert from '../utils/customAlert'` in place of
 * `import { Alert } from 'react-native'` — with no other changes needed.
 */
function alert(
  title: string,
  message?: string,
  buttons?: CustomAlertButton[],
  options?: CustomAlertOptions,
): void {
  const resolvedButtons =
    buttons && buttons.length > 0 ? buttons : [{text: 'OK'}];
  setPendingAlert?.({
    title,
    message,
    buttons: resolvedButtons,
    cancelable: options?.cancelable ?? true,
    onDismiss: options?.onDismiss,
  });
}

const CustomAlert = {alert};
export default CustomAlert;

export function CustomAlertHost() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [request, setRequest] = useState<PendingAlert | null>(null);

  setPendingAlert = setRequest;

  if (!request) {
    return null;
  }

  function dismiss() {
    request?.onDismiss?.();
    setRequest(null);
  }

  function press(button: CustomAlertButton) {
    setRequest(null);
    button.onPress?.();
  }

  const listMode = request.buttons.length > 2;

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={() => (request.cancelable ? dismiss() : undefined)}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={() => (request.cancelable ? dismiss() : undefined)}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.card}
          onPress={() => {}}>
          <Text style={styles.title}>{request.title}</Text>
          {request.message ? (
            <Text style={styles.message}>{request.message}</Text>
          ) : null}

          {listMode ? (
            <View style={styles.listWrap}>
              {request.buttons.map((button, i) => (
                <TouchableOpacity
                  key={`${button.text}-${i}`}
                  style={[styles.listRow, i > 0 && styles.listRowDivider]}
                  onPress={() => press(button)}>
                  <Text
                    style={[
                      styles.listRowText,
                      button.style === 'destructive' && styles.textDestructive,
                      button.style === 'cancel' && styles.textCancel,
                      button.style === 'default' && styles.textDefault,
                    ]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.row}>
              {request.buttons.map((button, i) => (
                <TouchableOpacity
                  key={`${button.text}-${i}`}
                  style={[
                    styles.rowBtn,
                    button.style === 'cancel'
                      ? styles.rowBtnCancel
                      : button.style === 'destructive'
                      ? styles.rowBtnDestructive
                      : styles.rowBtnDefault,
                  ]}
                  onPress={() => press(button)}>
                  <Text
                    style={[
                      styles.rowBtnText,
                      button.style === 'cancel' && styles.rowBtnTextCancel,
                    ]}>
                    {button.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingTop: 22,
      paddingHorizontal: 22,
      paddingBottom: 8,
      elevation: 10,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.2,
      shadowRadius: 12,
      overflow: 'hidden',
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    message: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 20,
      paddingBottom: 18,
    },
    rowBtn: {
      paddingVertical: 9,
      paddingHorizontal: 18,
      borderRadius: 10,
      minWidth: 64,
      alignItems: 'center',
    },
    rowBtnCancel: {
      backgroundColor: colors.background,
    },
    rowBtnDefault: {
      backgroundColor: colors.accent,
    },
    rowBtnDestructive: {
      backgroundColor: colors.danger,
    },
    rowBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.white,
    },
    rowBtnTextCancel: {
      color: colors.textMuted,
    },
    listWrap: {
      marginTop: 18,
      marginHorizontal: -22,
    },
    listRow: {
      paddingVertical: 15,
      paddingHorizontal: 22,
      alignItems: 'center',
    },
    listRowDivider: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    listRowText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    textDefault: {
      color: colors.accent,
    },
    textDestructive: {
      color: colors.danger,
    },
    textCancel: {
      color: colors.textMuted,
      fontWeight: '500',
    },
  });
