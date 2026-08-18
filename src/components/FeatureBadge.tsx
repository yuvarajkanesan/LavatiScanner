import React from 'react';
import {StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon, {IconFamily} from './Icon';

interface Props {
  icon: string;
  family?: IconFamily;
  color: string;
  size?: number;
  variant?: 'solid' | 'soft' | 'glow';
}

/** Color-coded circular icon badge used to give each feature/action its own
 * recognizable identity (e.g. red for PDF, green for images, purple for sign).
 * `glow` adds a soft gradient-tinted ring behind the icon for hero/emphasis
 * placements (e.g. a document's primary action). */
export default function FeatureBadge({
  icon,
  family = 'community',
  color,
  size = 40,
  variant = 'solid',
}: Props) {
  const isSolid = variant === 'solid';
  const isGlow = variant === 'glow';

  if (isGlow) {
    const ringSize = size * 1.45;
    return (
      <View style={[styles.glowRing, {width: ringSize, height: ringSize, borderRadius: ringSize / 2}]}>
        <LinearGradient
          colors={[`${color}33`, `${color}0D`]}
          style={[styles.glowFill, {width: ringSize, height: ringSize, borderRadius: ringSize / 2}]}>
          <View
            style={[
              styles.badge,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
              },
            ]}>
            <Icon name={icon} family={family} size={Math.round(size * 0.52)} color="#FFFFFF" />
          </View>
        </LinearGradient>
      </View>
    );
  }

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
      <Icon name={icon} family={family} size={Math.round(size * 0.52)} color={isSolid ? '#FFFFFF' : color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowFill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
