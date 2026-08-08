import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
});

const Tab = createBottomTabNavigator<MainTabParamList>();

const ICONS: Record<keyof MainTabParamList, string> = {
  Home: 'home',
  Tools: 'apps',
  Settings: 'settings',
};

export default function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerStyle: { backgroundColor: colors.background, elevation: 0, shadowOpacity: 0 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          height: 58,
          paddingBottom: 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Icon name={ICONS[route.name as keyof MainTabParamList]} size={size} color={color} />
        ),
      })}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Lavati Scanner', headerTitle: () => <HomeHeaderTitle /> }}
      />
      <Tab.Screen name="Tools" component={ToolsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
