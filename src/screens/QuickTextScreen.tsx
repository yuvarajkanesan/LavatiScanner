import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import Clipboard from '@react-native-clipboard/clipboard';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {recognizeTextFromImage} from '../services/ocr';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'QuickText'>;

export default function QuickTextScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const capturedUri = route.params?.capturedUri;
    if (capturedUri) {
      recognizeImage(capturedUri);
    } else {
      // Defensive: this screen should only ever be reached with a photo
      // already captured by the unified camera. If it somehow isn't, send
      // the user straight into that camera.
      navigation.replace('Scan', {mode: 'totext'});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recognizeImage(imagePath: string) {
    try {
      setImageUri(imagePath);
      setLoading(true);
      const recognized = await recognizeTextFromImage(imagePath);
      setText(recognized);
    } catch (error) {
      Alert.alert('OCR failed', 'Could not extract text from this page.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    navigation.replace('Scan', {mode: 'totext'});
  }

  function handleCopy() {
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>To Text</Text>
        <TouchableOpacity onPress={handleRetry} disabled={loading}>
          <Icon name="replay" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {imageUri && (
        <Image
          source={{uri: `file://${imageUri.replace('file://', '')}`}}
          style={styles.thumb}
          resizeMode="cover"
        />
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Recognizing text…</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}>
            <Text style={styles.bodyText} selectable>
              {text || 'No text was found.'}
            </Text>
          </ScrollView>
          <TouchableOpacity
            style={[styles.copyButton, {marginBottom: 16 + insets.bottom}]}
            onPress={handleCopy}
            disabled={!text}>
            <Icon
              name={copied ? 'check' : 'content-copy'}
              size={18}
              color={colors.white}
            />
            <Text style={styles.copyButtonText}>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    thumb: {
      width: '100%',
      height: 120,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingText: {
      marginTop: 10,
      color: colors.textMuted,
    },
    body: {
      flex: 1,
    },
    bodyContent: {
      padding: 18,
    },
    bodyText: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
    },
    copyButton: {
      flexDirection: 'row',
      margin: 16,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    copyButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
  });
