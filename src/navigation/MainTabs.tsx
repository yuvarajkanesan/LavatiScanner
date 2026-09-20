import React, { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { MainTabParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import ToolsScreen from '../screens/ToolsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import Icon from '../components/Icon';
import { useTheme } from '../theme/ThemeContext';

function HomeHeaderTitle() {
  const { colors } = useTheme();
  return (
    <View style={styles.headerTitleRow}>
      <Image source={require('../assets/app-icon.png')} style={styles.headerIcon} />
      <Text style={[styles.headerTitleText, { color: colors.text }]}>Lavati Scanner</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '700',
  },
  tabIconWrap: {
    width: 46,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS_OUTLINE: Record<keyof MainTabParamList, string> = {
  Home: 'home-outline',
  Tools: 'toolbox-outline',
  Settings: 'cog-outline',
};
const ICONS_FILLED: Record<keyof MainTabParamList, string> = {
  Home: 'home',
  Tools: 'toolbox',
  Settings: 'cog',
};
/** Each tab gets its own color from the fun palette instead of one uniform
 * accent, so the bar itself reads as playful/colorful. */
const TAB_COLOR_INDEX: Record<keyof MainTabParamList, number> = {
  Home: 0,
  Tools: 5,
  Settings: 4,
};

function TabIcon({
  focused,
  name,
  activeColor,
  inactiveColor,
  size,
}: {
  focused: boolean;
  name: string;
  activeColor: string;
  inactiveColor: string;
  size: number;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (focused) {
      scale.value = withSpring(1.2, { damping: 6, stiffness: 300 }, () => {
        scale.value = withSpring(1, { damping: 8, stiffness: 260 });
      });
    }
  }, [focused, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.tabIconWrap,
        focused && { backgroundColor: `${activeColor}26` },
        animatedStyle,
      ]}>
      <Icon
        name={name}
        family="community"
        size={size - 2}
        color={focused ? activeColor : inactiveColor}
      />
    </Animated.View>
  );
}

export default function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerStyle: {
          elevation: 2,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        },
        headerBackground: () => (
          <LinearGradient
            colors={colors.gradientHero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          />
        ),
        headerShadowVisible: false,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          height: 70 + insets.bottom,
          paddingBottom: 16 + insets.bottom,
          paddingTop: 8,
          elevation: 8,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarIcon: ({ focused, color, size }) => {
          const name = route.name as keyof MainTabParamList;
          const activeColor = colors.funPalette[TAB_COLOR_INDEX[name]];
          return (
            <TabIcon
              focused={focused}
              name={focused ? ICONS_FILLED[name] : ICONS_OUTLINE[name]}
              activeColor={activeColor}
              inactiveColor={color}
              size={size}
            />
          );
        },
      })}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Lavati Scanner',
          headerTitle: () => <HomeHeaderTitle />,
          tabBarActiveTintColor: colors.funPalette[TAB_COLOR_INDEX.Home],
        }}
      />
      <Tab.Screen
        name="Tools"
        component={ToolsScreen}
        options={{ tabBarActiveTintColor: colors.funPalette[TAB_COLOR_INDEX.Tools] }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarActiveTintColor: colors.funPalette[TAB_COLOR_INDEX.Settings] }}
      />
    </Tab.Navigator>
  );
}
