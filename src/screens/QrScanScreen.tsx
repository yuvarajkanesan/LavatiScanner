import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Alert from '../utils/customAlert';
import Clipboard from '@react-native-clipboard/clipboard';
import {Barcode} from '@react-native-ml-kit/barcode-scanning';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../navigation/types';
import {scanBarcodesFromImage} from '../services/barcode';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'QrScan'>;

const isUrl = (value: string) => /^https?:\/\//i.test(value);

export default function QrScanScreen({navigation, route}: Props) {
  const {colors} = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Barcode[] | null>(null);

  useEffect(() => {
    const capturedUri = route.params?.capturedUri;
    if (capturedUri) {
      scanImage(capturedUri);
    } else {
      // Defensive: this screen should only ever be reached with a photo
      // already captured by the unified camera. If it somehow isn't, send
      // the user straight into that camera.
      navigation.replace('Scan', {mode: 'qrcode'});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scanImage(imagePath: string) {
    try {
      setResults(null);
      setLoading(true);
      const barcodes = await scanBarcodesFromImage(imagePath);
      setResults(barcodes);
    } catch (error) {
      Alert.alert(
        'Scan failed',
        'Could not read a QR code or barcode from that photo.',
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    navigation.replace('Scan', {mode: 'qrcode'});
  }

  function handleCopy(value: string) {
    Clipboard.setString(value);
  }

  function handleOpen(value: string) {
    Linking.openURL(value).catch(() =>
      Alert.alert('Could not open link', value),
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Icon name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>QR Code</Text>
        <TouchableOpacity onPress={handleRetry} disabled={loading}>
          <Icon name="replay" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Reading code…</Text>
        </View>
      ) : results && results.length === 0 ? (
        <View style={styles.center}>
          <Icon name="qr-code-scanner" size={40} color={colors.textMuted} />
          <Text style={styles.loadingText}>No QR code or barcode found.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {results?.map((barcode, i) => (
            <View key={i} style={styles.resultCard}>
              <Text style={styles.resultValue} selectable>
                {barcode.value}
              </Text>
              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={styles.resultActionBtn}
                  onPress={() => handleCopy(barcode.value)}>
                  <Icon name="content-copy" size={16} color={colors.accent} />
                  <Text style={styles.resultActionText}>Copy</Text>
                </TouchableOpacity>
                {isUrl(barcode.value) && (
                  <TouchableOpacity
                    style={styles.resultActionBtn}
                    onPress={() => handleOpen(barcode.value)}>
                    <Icon name="open-in-new" size={16} color={colors.accent} />
                    <Text style={styles.resultActionText}>Open</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
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
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    loadingText: {
      marginTop: 10,
      color: colors.textMuted,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    retryButtonText: {
      color: colors.white,
      fontWeight: '700',
    },
    list: {
      padding: 16,
    },
    resultCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 14,
      marginBottom: 12,
    },
    resultValue: {
      fontSize: 15,
      color: colors.text,
    },
    resultActions: {
      flexDirection: 'row',
      gap: 18,
      marginTop: 10,
    },
    resultActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    resultActionText: {
      fontSize: 13,
      color: colors.accent,
      fontWeight: '600',
    },
  });
