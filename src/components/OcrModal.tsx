import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import Icon from './Icon';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  loading: boolean;
  text: string;
  onClose: () => void;
}

export default function OcrModal({ visible, loading, text, onClose }: Props) {
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Extracted Text</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Icon name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingText}>Recognizing text…</Text>
          </View>
        ) : (
          <>
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <Text style={styles.bodyText} selectable>
                {text || 'No text was found on this page.'}
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.copyButton}
              onPress={handleCopy}
              disabled={!text}>
              <Icon name={copied ? 'check' : 'content-copy'} size={18} color={colors.white} />
              <Text style={styles.copyButtonText}>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
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
  closeButton: {
    padding: 4,
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
