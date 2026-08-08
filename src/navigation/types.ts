import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import {NativeStackScreenProps} from '@react-navigation/native-stack';

export type MainTabParamList = {
  Home: undefined;
  Tools: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  ScanLauncher: {folderId?: string | null} | undefined;
  Scan: {folderId?: string | null} | undefined;
  Filter: {pageId: string} | undefined;
  DocumentDetail: {docId: string};
  Folders: undefined;
  FolderDetail: {folderId: string};
  IdCardScan: {folderId?: string | null} | undefined;
  BookScan: {folderId?: string | null} | undefined;
  QrScan: undefined;
  QuickText: undefined;
  PdfMerge: undefined;
  PdfEditor: {uri: string; name: string} | undefined;
  PdfPasswordRemove: undefined;
  SignPage: {docId: string; pageId: string; filePath: string};
  SignPdf: undefined;
  Collage: undefined;
  PdfWatermark: undefined;
  Compression: undefined;
  TermsAndConditions: undefined;
  PrivacyPolicy: undefined;
};

export type TabScreenProps<T extends keyof MainTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, T>,
    NativeStackScreenProps<RootStackParamList>
  >;
