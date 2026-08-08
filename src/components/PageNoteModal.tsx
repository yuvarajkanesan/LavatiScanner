import React, {useEffect, useState} from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  initialValue: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export default function PageNoteModal({
  visible,
  initialValue,
  onSave,
  onClose,
}: Props) {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Page Note</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Icon name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder="Add a note for this page…"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          autoFocus
        />

        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => onSave(value.trim())}>
          <Icon name="check" size={18} color={colors.white} />
          <Text style={styles.saveButtonText}>Save Note</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    input: {
      flex: 1,
      margin: 18,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
    },
    saveButton: {
      flexDirection: 'row',
      margin: 16,
      marginTop: 0,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    saveButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
  });
