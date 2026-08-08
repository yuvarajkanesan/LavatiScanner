import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export default function PrivacyPolicyScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.updated}>Last updated: August 2026</Text>

      <Section title="On-Device Processing">
        Lavati Scanner is built to keep your documents on your device. Scanning, edge detection,
        filters, OCR (text recognition), QR/barcode reading, and PDF generation all run locally —
        none of it is sent to a server, because there is no server. We have no way to see your
        documents.
      </Section>

      <Section title="What's Stored, and Where">
        Scanned pages are saved as JPG files in the app's private storage on your device.
        Document names, folders, and page order are kept in a local database, also on-device.
        None of this leaves your phone unless you explicitly share or export it (e.g. via the
        share sheet, or by exporting a PDF).
      </Section>

      <Section title="Vault PIN & Biometrics">
        If you set a vault PIN to lock a folder, it is hashed before being stored — the app never
        keeps your raw PIN. If you enable fingerprint/face unlock, that credential is held by
        your device's secure keystore, gated by your OS's own biometric hardware; the app itself
        never receives your fingerprint or face data — it only receives a yes/no result from the
        operating system.
      </Section>

      <Section title="Permissions">
        The App requests camera access to scan documents, and photo library access only when you
        choose to import existing images. Neither permission is used for anything beyond that
        immediate action.
      </Section>

      <Section title="Third Parties">
        The App does not include analytics or ad tracking SDKs by default. If a future version
        adds advertising, this policy will be updated first, and ads will be clearly labeled as
        such.
      </Section>

      <Section title="Your Choices">
        You can delete any document, folder, or your entire vault PIN at any time from within the
        App. Uninstalling the App removes all of its locally stored data from your device.
      </Section>

      <Section title="Changes to This Policy">
        If this policy changes, the "Last updated" date above will change with it. Material
        changes will be called out in the app's release notes.
      </Section>

      <Section title="Contact">
        Questions about this policy can be directed to the app publisher listed on the store page
        you installed the App from.
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
