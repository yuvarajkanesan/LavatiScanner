import React, {useMemo} from 'react';
import {Modal, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon, {IconFamily} from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

export interface SheetOption {
  key: string;
  label: string;
  icon: string;
  /** Optional icon family + accent color, for a color-coded option list.
   * Falls back to the plain accent-tinted look when omitted. */
  family?: IconFamily;
  color?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: SheetOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
  onClose: () => void;
}

export default function OptionSheet({
  visible,
  title,
  options,
  selectedKey,
  onSelect,
  onClose,
}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.sheet}
          onPress={() => {}}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={8}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsWrap}>
            {options.map(option => {
              const active = option.key === selectedKey;
              const tint = option.color ?? colors.accent;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[styles.row, active && styles.rowActive]}
                  onPress={() => {
                    onSelect(option.key);
                    onClose();
                  }}>
                  <View
                    style={[
                      styles.iconWrap,
                      {backgroundColor: active ? tint : `${tint}1F`},
                    ]}>
                    <Icon
                      name={option.icon}
                      family={option.family}
                      size={18}
                      color={active ? colors.white : tint}
                    />
                  </View>
                  <Text
                    style={[styles.rowLabel, active && styles.rowLabelActive]}>
                    {option.label}
                  </Text>
                  {active && (
                    <Icon name="check-circle" size={20} color={colors.accent} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
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
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingBottom: 28,
      elevation: 12,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: -2},
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: 10,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionsWrap: {
      paddingTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 12,
      paddingHorizontal: 10,
      paddingVertical: 12,
      borderRadius: 12,
    },
    rowActive: {
      backgroundColor: colors.accentMuted,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    rowLabelActive: {
      fontWeight: '700',
      color: colors.accent,
    },
  });
