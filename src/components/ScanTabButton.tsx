import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import RNReanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Icon from './Icon';
import {useTheme} from '../theme/ThemeContext';
import {MainTabParamList, RootStackParamList} from '../navigation/types';

const SCAN_ORANGE = '#FF7A1A';
const BUTTON_SIZE = 64;

const ICONS_OUTLINE: Record<keyof MainTabParamList, string> = {
  Home: 'home-outline',
  AllFiles: 'file-multiple-outline',
  Tools: 'tools',
  Settings: 'cog-outline',
};

/** Soft expanding halo behind the Scan button - two staggered rings so the
 * glow reads as continuous rather than a single pulse with a visible gap. */
function PulseRing({delay = 0, enabled = true}: {delay?: number; enabled?: boolean}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!enabled) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(t, {toValue: 0, duration: 0, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, enabled, t]);

  if (!enabled) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          opacity: t.interpolate({inputRange: [0, 1], outputRange: [0.45, 0]}),
          transform: [{scale: t.interpolate({inputRange: [0, 1], outputRange: [1, 2.1]})}],
        },
      ]}
    />
  );
}

/** Raised, pulsing orange Scan button for the center of the bottom tab bar -
 * not a real tab (it has no screen of its own), tapping it jumps straight to
 * the Scan capture screen the same way Home's "Scan" quick action does. */
function ScanTabButton({onPress}: {onPress: () => void}) {
  const [animate, setAnimate] = useState(true);
  const float = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => setAnimate(!reduced));
  }, []);

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: -4,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, float]);

  const pressIn = () =>
    Animated.spring(press, {toValue: 0.92, useNativeDriver: true, speed: 40}).start();
  const pressOut = () =>
    Animated.spring(press, {toValue: 1, useNativeDriver: true, speed: 40}).start();

  return (
    <View style={styles.wrap}>
      <PulseRing enabled={animate} />
      <PulseRing enabled={animate} delay={1100} />
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel="Scan document">
        <Animated.View
          style={[styles.button, {transform: [{translateY: float}, {scale: press}]}]}>
          <Icon name="line-scan" family="community" size={28} color="#FFFFFF" />
        </Animated.View>
      </Pressable>
      <Text style={styles.scanLabel}>Scan</Text>
    </View>
  );
}

function TabIcon({
  focused,
  name,
  activeColor,
  inactiveColor,
}: {
  focused: boolean;
  name: string;
  activeColor: string;
  inactiveColor: string;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.2, {damping: 6, stiffness: 300}, () => {
        scale.value = withSpring(1, {damping: 8, stiffness: 260});
      });
    }
  }, [focused, scale]);
  const animatedStyle = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));

  return (
    <RNReanimated.View style={animatedStyle}>
      <Icon name={name} family="community" size={24} color={focused ? activeColor : inactiveColor} />
    </RNReanimated.View>
  );
}

/** Custom bottom tab bar: the usual Home/Files/Tools/Settings tabs with the
 * animated Scan button floating in the middle, in place of a 5th tab. */
export default function ScanTabBar({state, descriptors, navigation, insets}: BottomTabBarProps) {
  const {colors} = useTheme();
  const routes = state.routes;
  const half = Math.ceil(routes.length / 2);

  function handleScanPress() {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    parent?.navigate('Scan', {folderId: null});
  }

  function renderTab(route: (typeof routes)[number], index: number) {
    const {options} = descriptors[route.key];
    const focused = state.index === index;
    const label = (options.tabBarLabel as string) ?? options.title ?? route.name;
    const color = focused ? colors.accent : colors.textMuted;

    const onPress = () => {
      const event = navigation.emit({type: 'tabPress', target: route.key, canPreventDefault: true});
      if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <Pressable
        key={route.key}
        style={styles.tab}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{selected: focused}}>
        <TabIcon
          focused={focused}
          name={ICONS_OUTLINE[route.name as keyof MainTabParamList]}
          activeColor={colors.accent}
          inactiveColor={colors.textMuted}
        />
        <Text style={[styles.tabLabel, {color}]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 70 + insets.bottom,
          paddingBottom: 16 + insets.bottom,
        },
      ]}>
      {routes.slice(0, half).map((r, i) => renderTab(r, i))}
      <View style={styles.centerSlot}>
        <ScanTabButton onPress={handleScanPress} />
      </View>
      {routes.slice(half).map((r, i) => renderTab(r, i + half))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  tab: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  tabLabel: {fontSize: 11, fontWeight: '700', marginTop: 2},
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    overflow: 'visible',
    marginTop: -40,
  },
  wrap: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: SCAN_ORANGE,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: SCAN_ORANGE,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
  },
  scanLabel: {
    position: 'absolute',
    bottom: -20,
    fontSize: 11,
    fontWeight: '700',
    color: SCAN_ORANGE,
  },
});
