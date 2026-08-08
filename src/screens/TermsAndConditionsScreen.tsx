import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export default function TermsAndConditionsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.updated}>Last updated: August 2026</Text>

      <Section title="1. Acceptance of Terms">
        By downloading, installing, or using Lavati Scanner ("the App"), you agree to be bound
        by these Terms and Conditions. If you do not agree, please do not use the App.
      </Section>

      <Section title="2. What the App Does">
        Lavati Scanner lets you capture, organize, and export documents, ID cards, and other
        images using your device's camera, and run on-device text recognition (OCR) on them.
        All processing happens locally on your device.
      </Section>

      <Section title="3. Your Content">
        You retain all rights to the documents, images, and text you create or import using the
        App. The App does not claim ownership over your content, and — since everything is
        processed and stored on-device — we never see it.
      </Section>

      <Section title="4. Acceptable Use">
        You agree not to use the App to capture, store, or process content that infringes on
        others' rights, violates applicable law, or that you do not have the right to possess.
      </Section>

      <Section title="5. No Warranty">
        The App is provided "as is" without warranties of any kind, express or implied,
        including but not limited to accuracy of OCR results, fitness for a particular purpose,
        or uninterrupted operation.
      </Section>

      <Section title="6. Limitation of Liability">
        To the maximum extent permitted by law, Lavati Scanner and its developers are not liable
        for any indirect, incidental, or consequential damages arising from your use of, or
        inability to use, the App — including loss of data.
      </Section>

      <Section title="7. Changes to These Terms">
        These Terms may be updated from time to time. Continued use of the App after changes are
        published constitutes acceptance of the revised Terms.
      </Section>

      <Section title="8. Contact">
        Questions about these Terms can be directed to the app publisher listed on the store
        page you installed the App from.
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  updated: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 20,
  },
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
  },
});
