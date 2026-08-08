import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Share from 'react-native-share';
import {pickPdfFile} from '../services/documentPicker';
import {addWatermarkToPdf} from '../services/pdfEdit';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

type Status = 'idle' | 'working' | 'error';

export default function PdfWatermarkScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');

  async function handlePickAndWatermark() {
    if (!watermarkText.trim()) {
      return;
    }
    const picked = await pickPdfFile();
    if (!picked) {
      return;
    }

    setFileName(picked.name);
    setStatus('working');

    try {
      const outputName = picked.name.replace(/\.pdf$/i, '') + '_watermarked';
      const outputPath = await addWatermarkToPdf(
        picked.uri,
        watermarkText.trim(),
        outputName,
      );
      setStatus('idle');
      await Share.open({
        url: `file://${outputPath}`,
        type: 'application/pdf',
        failOnCancel: false,
      });
    } catch (error) {
      setStatus('error');
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Icon
          name="watermark"
          family="community"
          size={40}
          color={colors.accent}
        />
      </View>
      <Text style={styles.title}>PDF Watermark</Text>
      <Text style={styles.description}>
        Stamps a diagonal, translucent watermark across every page of a PDF.
      </Text>

      <TextInput
        style={styles.input}
        value={watermarkText}
        onChangeText={setWatermarkText}
        placeholder="Watermark text"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
      />

      {fileName && status !== 'idle' && (
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
      )}

      {status === 'error' && (
        <Text style={styles.error}>Could not add a watermark to this PDF.</Text>
      )}

      <TouchableOpacity
        style={[styles.button, !watermarkText.trim() && styles.buttonDisabled]}
        onPress={handlePickAndWatermark}
        disabled={status === 'working' || !watermarkText.trim()}>
        {status === 'working' ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <>
            <Icon name="file-open" size={18} color={colors.white} />
            <Text style={styles.buttonText}>Choose PDF</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    iconWrap: {
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.accentMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    description: {
      marginTop: 8,
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    input: {
      width: '100%',
      marginTop: 22,
      height: 48,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
      textAlign: 'center',
    },
    fileName: {
      marginTop: 20,
      fontSize: 13,
      color: colors.text,
      fontWeight: '600',
    },
    error: {
      marginTop: 16,
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
      lineHeight: 19,
    },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 28,
      height: 50,
      paddingHorizontal: 28,
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 15,
    },
  });
