/**
 * Lavati Scanner
 * @format
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { ScanSessionProvider } from './src/context/ScanSessionContext';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { TextPromptHost } from './src/utils/promptForText';
import { getDatabase } from './src/db/database';
import { colors } from './src/theme/colors';

export default function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getDatabase()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ScanSessionProvider>
            <ThemedApp />
            <TextPromptHost />
          </ScanSessionProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const { colors: themeColors, resolvedScheme } = useTheme();
  return (
    <>
      <StatusBar
        barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={themeColors.background}
      />
      <RootNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
