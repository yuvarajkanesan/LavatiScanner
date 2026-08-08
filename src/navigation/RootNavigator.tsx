import React from 'react';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {RootStackParamList} from './types';
import MainTabs from './MainTabs';
import ScanLauncherScreen from '../screens/ScanLauncherScreen';
import ScanScreen from '../screens/ScanScreen';
import FilterScreen from '../screens/FilterScreen';
import DocumentDetailScreen from '../screens/DocumentDetailScreen';
import FoldersScreen from '../screens/FoldersScreen';
import FolderDetailScreen from '../screens/FolderDetailScreen';
import IdCardScanScreen from '../screens/IdCardScanScreen';
import BookScanScreen from '../screens/BookScanScreen';
import QrScanScreen from '../screens/QrScanScreen';
import QuickTextScreen from '../screens/QuickTextScreen';
import PdfMergeScreen from '../screens/PdfMergeScreen';
import PdfEditorScreen from '../screens/PdfEditorScreen';
import PdfPasswordRemoveScreen from '../screens/PdfPasswordRemoveScreen';
import SignPageScreen from '../screens/SignPageScreen';
import SignPdfScreen from '../screens/SignPdfScreen';
import CollageScreen from '../screens/CollageScreen';
import PdfWatermarkScreen from '../screens/PdfWatermarkScreen';
import CompressionScreen from '../screens/CompressionScreen';
import TermsAndConditionsScreen from '../screens/TermsAndConditionsScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import {useTheme} from '../theme/ThemeContext';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const {colors, resolvedScheme} = useTheme();
  const navTheme = resolvedScheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer
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
          headerStyle: {backgroundColor: colors.background},
          headerTitleStyle: {color: colors.text},
          headerTintColor: colors.accent,
          contentStyle: {backgroundColor: colors.background},
        }}>
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{headerShown: false}}
        />
        <Stack.Screen
          name="ScanLauncher"
          component={ScanLauncherScreen}
          options={{headerShown: false, presentation: 'fullScreenModal'}}
        />
        <Stack.Screen
          name="Scan"
          component={ScanScreen}
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
          name="Folders"
          component={FoldersScreen}
          options={{title: 'Folders'}}
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
          options={{title: 'PDF Editor'}}
        />
        <Stack.Screen
          name="PdfPasswordRemove"
          component={PdfPasswordRemoveScreen}
          options={{title: 'PDF Restrictions'}}
        />
        <Stack.Screen
          name="SignPage"
          component={SignPageScreen}
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
