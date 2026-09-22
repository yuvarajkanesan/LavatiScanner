import React from 'react';
import {StyleProp, TextStyle} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {colors} from '../theme/colors';

export type IconFamily = 'material' | 'community';

interface Props {
  name: string;
  family?: IconFamily;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export default function Icon({
  name,
  family = 'material',
  size = 22,
  color = colors.text,
  style,
}: Props) {
  if (family === 'community') {
    return (
      <MaterialCommunityIcons name={name} size={size} color={color} style={style} />
    );
  }
  return <MaterialIcons name={name} size={size} color={color} style={style} />;
}
