import React, {useEffect, useRef} from 'react';
import {Linking} from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  NavigationContainerRef,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from './types';
import MainTabs from './MainTabs';
import CaptureScreen from '../screens/CaptureScreen';
import TrimPageScreen from '../screens/TrimPageScreen';
import FilterScreen from '../screens/FilterScreen';
import DocumentDetailScreen from '../screens/DocumentDetailScreen';
import FolderDetailScreen from '../screens/FolderDetailScreen';
import IdCardScanScreen from '../screens/IdCardScanScreen';
import BookScanScreen from '../screens/BookScanScreen';
import QrScanScreen from '../screens/QrScanScreen';
import QuickTextScreen from '../screens/QuickTextScreen';
import PdfMergeScreen from '../screens/PdfMergeScreen';
import PdfEditorScreen from '../screens/PdfEditorScreen';
import PdfPasswordRemoveScreen from '../screens/PdfPasswordRemoveScreen';
import SignPageScreen from '../screens/SignPageScreen';
import CropPageScreen from '../screens/CropPageScreen';
import MarkupPageScreen from '../screens/MarkupPageScreen';
import SignPdfScreen from '../screens/SignPdfScreen';
import CollageScreen from '../screens/CollageScreen';
import PdfWatermarkScreen from '../screens/PdfWatermarkScreen';
import CompressionScreen from '../screens/CompressionScreen';
import TermsAndConditionsScreen from '../screens/TermsAndConditionsScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import {useTheme} from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Routes a `lavatiscanner://<path>` deep link (app-icon shortcuts, the
 * Quick Settings tile, the home-screen widget) to the matching screen. */
function navigateForDeepLink(
  navRef: NavigationContainerRef<RootStackParamList>,
  url: string,
) {
  const path = url.replace(/^lavatiscanner:\/\//, '').replace(/\/$/, '');
  switch (path) {
    case 'scan':
      navRef.navigate('Scan', {folderId: null});
      break;
    case 'idcard':
      navRef.navigate('Scan', {folderId: null, mode: 'idcard'});
      break;
    case 'import':
      navRef.navigate('MainTabs', {
        screen: 'Home',
        params: {autoAction: 'import'},
      });
      break;
    case 'search':
      navRef.navigate('MainTabs', {
        screen: 'Home',
        params: {autoAction: 'search'},
      });
      break;
  }
}

export default function RootNavigator() {
  const {colors, resolvedScheme} = useTheme();
  const navTheme = resolvedScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  // A deep link can arrive (cold-start URL, or the 'url' event) before the
  // container finishes its first render - queued here and flushed from
  // onReady instead of dropped.
  const pendingUrlRef = useRef<string | null>(null);
  const containerReadyRef = useRef(false);

  useEffect(() => {
    function handleUrl(url: string) {
      if (!containerReadyRef.current || !navRef.current) {
        pendingUrlRef.current = url;
        return;
      }
      navigateForDeepLink(navRef.current, url);
    }

    Linking.getInitialURL().then(url => {
      if (url) {
        handleUrl(url);
      }
    });
    const subscription = Linking.addEventListener('url', ({url}) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  return (
    <NavigationContainer
      ref={navRef}
      onReady={() => {
        containerReadyRef.current = true;
        const pending = pendingUrlRef.current;
        if (pending && navRef.current) {
          pendingUrlRef.current = null;
          navigateForDeepLink(navRef.current, pending);
        }
      }}
      theme={{
        ...navTheme,
        colors: {
          ...navTheme.colors,
          primary: colors.accent,
          background: colors.background,
          card: colors.background,
          text: colors.text,
          border: colors.border,
        },
      }}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {backgroundColor: colors.accent},
          headerTitleStyle: {color: colors.white, fontWeight: '700'},
          headerTintColor: colors.white,
          headerShadowVisible: false,
          contentStyle: {backgroundColor: colors.background},
        }}>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="Scan"
          component={CaptureScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="Trim"
          component={TrimPageScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="Filter"
          component={FilterScreen}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="DocumentDetail"
          component={DocumentDetailScreen}
          options={{title: ''}}
        />
        <Stack.Screen
          name="FolderDetail"
          component={FolderDetailScreen}
          options={{title: 'Folder'}}
        />
        <Stack.Screen
          name="IdCardScan"
          component={IdCardScanScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="BookScan"
          component={BookScanScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="QrScan"
          component={QrScanScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="QuickText"
          component={QuickTextScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="PdfMerge"
          component={PdfMergeScreen}
          options={{title: 'PDF Merge'}}
        />
        <Stack.Screen
          name="PdfEditor"
          component={PdfEditorScreen}
          options={{title: ''}}
        />
        <Stack.Screen
          name="PdfPasswordRemove"
          component={PdfPasswordRemoveScreen}
          options={{title: 'Remove Password'}}
        />
        <Stack.Screen
          name="SignPage"
          component={SignPageScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="CropPage"
          component={CropPageScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="MarkupPage"
          component={MarkupPageScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="SignPdf"
          component={SignPdfScreen}
          options={{title: 'Sign PDF'}}
        />
        <Stack.Screen
          name="Collage"
          component={CollageScreen}
          options={{title: 'Collage Images'}}
        />
        <Stack.Screen
          name="PdfWatermark"
          component={PdfWatermarkScreen}
          options={{title: 'PDF Watermark'}}
        />
        <Stack.Screen
          name="Compression"
          component={CompressionScreen}
          options={{title: 'Compression'}}
        />
        <Stack.Screen
          name="TermsAndConditions"
          component={TermsAndConditionsScreen}
          options={{title: 'Terms & Conditions'}}
        />
        <Stack.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicyScreen}
          options={{title: 'Privacy Policy'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
