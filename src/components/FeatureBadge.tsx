import React from 'react';
import {StyleSheet, View} from 'react-native';
import Icon, {IconFamily} from './Icon';

interface Props {
  icon: string;
  family?: IconFamily;
  color: string;
  size?: number;
  variant?: 'solid' | 'soft';
}

/** Color-coded circular icon badge used to give each feature/action its own
 * recognizable identity (e.g. red for PDF, green for images, purple for sign). */
export default function FeatureBadge({
  icon,
  family = 'community',
  color,
  size = 40,
  variant = 'solid',
}: Props) {
  const isSolid = variant === 'solid';
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: isSolid ? color : `${color}1F`,
        },
      ]}>
      <Icon
        name={icon}
        family={family}
        size={Math.round(size * 0.52)}
        color={isSolid ? '#FFFFFF' : color}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
