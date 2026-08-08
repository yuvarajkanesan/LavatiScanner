import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onPress: () => void;
  icon?: string;
  size?: number;
  bottom?: number;
  variant?: 'primary' | 'secondary';
}

export default function Fab({ onPress, icon = 'add', size = 58, bottom = 24, variant = 'primary' }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isSecondary = variant === 'secondary';
  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          bottom,
          backgroundColor: isSecondary ? colors.surface : colors.accent,
          borderWidth: isSecondary ? 1 : 0,
          borderColor: colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}>
      <Icon name={icon} size={size * 0.45} color={isSecondary ? colors.accent : colors.white} />
    </TouchableOpacity>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
