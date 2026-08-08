import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {colors} from '../theme/colors';

export type IconFamily = 'material' | 'community';

interface Props {
  name: string;
  family?: IconFamily;
  size?: number;
  color?: string;
}

export default function Icon({
  name,
  family = 'material',
  size = 22,
  color = colors.text,
}: Props) {
  if (family === 'community') {
    return <MaterialCommunityIcons name={name} size={size} color={color} />;
  }
  return <MaterialIcons name={name} size={size} color={color} />;
}
