/**
 * Lavati Scanner
 * @format
 */

import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StatusBar, StyleSheet, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import AppLockGate from './src/components/AppLockGate';
import {ScanSessionProvider} from './src/context/ScanSessionContext';
import {ThemeProvider, useTheme} from './src/theme/ThemeContext';
import {FontScaleProvider} from './src/theme/FontScaleContext';
import {TextPromptHost} from './src/utils/promptForText';
import {CustomAlertHost} from './src/utils/customAlert';
import {getDatabase} from './src/db/database';
import {colors} from './src/theme/colors';

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
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider>
          <ThemeProvider>
            <FontScaleProvider>
              <ScanSessionProvider>
                <AppLockGate>
                  <ThemedApp />
                </AppLockGate>
                <TextPromptHost />
                <CustomAlertHost />
              </ScanSessionProvider>
            </FontScaleProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

function ThemedApp() {
  const {resolvedScheme} = useTheme();
  return (
    <>
      {/* backgroundColor/translucent were removed - Android now forces
          edge-to-edge (transparent, translucent status bar) unconditionally. */}
      <StatusBar
        barStyle={resolvedScheme === 'dark' ? 'light-content' : 'dark-content'}
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
