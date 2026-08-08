import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Share from 'react-native-share';
import { pickPdfFile } from '../services/documentPicker';
import { removePdfRestrictions } from '../services/pdfEdit';
import Icon from '../components/Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

type Status = 'idle' | 'working' | 'error';

export default function PdfPasswordRemoveScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handlePickAndUnlock() {
    const picked = await pickPdfFile();
    if (!picked) return;

    setFileName(picked.name);
    setStatus('working');
    setErrorMessage(null);

    try {
      const outputName = picked.name.replace(/\.pdf$/i, '') + '_unlocked';
      const outputPath = await removePdfRestrictions(picked.uri, outputName);
      setStatus('idle');
      await Share.open({ url: `file://${outputPath}`, type: 'application/pdf', failOnCancel: false });
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        "Couldn't remove restrictions from this PDF. If it asks for a password just to open it, that's real encryption and can't be removed on-device.",
      );
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Icon name="lock-open" size={40} color={colors.accent} />
      </View>
      <Text style={styles.title}>Remove PDF Restrictions</Text>
      <Text style={styles.description}>
        Strips edit/print/copy locks from a PDF that opens without a password. This can't
        crack a PDF that requires a password just to open — that needs real decryption.
      </Text>

      {fileName && status !== 'idle' && (
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
      )}

      {status === 'error' && errorMessage && (
        <Text style={styles.error}>{errorMessage}</Text>
      )}

      <TouchableOpacity style={styles.button} onPress={handlePickAndUnlock} disabled={status === 'working'}>
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

const createStyles = (colors: AppColors) => StyleSheet.create({
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
  buttonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
