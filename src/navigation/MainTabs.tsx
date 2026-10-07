import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LinearGradient from 'react-native-linear-gradient';
import { MainTabParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import AllFilesScreen from '../screens/FoldersScreen';
import ToolsScreen from '../screens/ToolsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ScanTabBar from '../components/ScanTabButton';
import { useTheme } from '../theme/ThemeContext';

function HomeHeaderTitle() {
  return (
    <View style={styles.headerTitleRow}>
      <Image source={require('../assets/app-icon.png')} style={styles.headerIcon} />
      <Text style={[styles.headerTitleText, { color: '#FFFFFF' }]}>Lavati Scanner</Text>
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

export default function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      tabBar={props => <ScanTabBar {...props} />}
      screenOptions={{
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
      }}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Lavati Scanner',
          headerTitle: () => <HomeHeaderTitle />,
          tabBarLabel: 'Home',
          // Solid accent-blue header (not the shared pale gradient wash) -
          // HomeScreen's own search-bar block continues this same blue
          // underneath it, so the two read as one seamless banner.
          headerStyle: { elevation: 0, shadowOpacity: 0 },
          headerBackground: () => (
            <View style={{ flex: 1, backgroundColor: colors.accent }} />
          ),
        }}
      />
      <Tab.Screen
        name="AllFiles"
        component={AllFilesScreen}
        options={{
          title: 'All Files',
          headerShown: false,
          tabBarLabel: 'Files',
        }}
      />
      <Tab.Screen
        name="Tools"
        component={ToolsScreen}
        options={{
          title: 'Tools',
          headerShown: false,
          tabBarLabel: 'Tools',
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          headerShown: false,
          tabBarLabel: 'Settings',
        }}
      />
    </Tab.Navigator>
  );
}
