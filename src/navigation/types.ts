import {
  CompositeScreenProps,
  NavigatorScreenParams,
} from '@react-navigation/native';
import {BottomTabScreenProps} from '@react-navigation/bottom-tabs';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {IdCardSubMode} from '../constants/idCardModes';

export type MainTabParamList = {
  Home: undefined;
  Tools: undefined;
  Settings: undefined;
};

export type CaptureMode = 'book' | 'totext' | 'docs' | 'idcard' | 'qrcode';

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  Scan:
    | {
        folderId?: string | null;
        mode?: CaptureMode;
        idCardBackCapture?: {frontUri: string; subMode: IdCardSubMode};
      }
    | undefined;
  Trim: {rawUri: string; pageId?: string};
  Filter: {pageId: string} | undefined;
  DocumentDetail: {docId: string};
  Folders: undefined;
  FolderDetail: {folderId: string};
  IdCardScan:
    | {
        folderId?: string | null;
        capturedUri?: string;
        subMode?: IdCardSubMode;
        backCapturedUri?: string;
      }
    | undefined;
  BookScan: {folderId?: string | null; capturedUri?: string} | undefined;
  QrScan: {capturedUri?: string} | undefined;
  QuickText: {capturedUri?: string} | undefined;
  PdfMerge: undefined;
  PdfEditor: {uri: string; name: string} | undefined;
  PdfPasswordRemove: undefined;
  SignPage: {docId: string; pageId: string; filePath: string};
  CropPage: {docId: string; pageId: string; filePath: string};
  MarkupPage: {docId: string; pageId: string; filePath: string};
  SignPdf: undefined;
  Collage: {docId?: string} | undefined;
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
