import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Alert from '../utils/customAlert';
import Icon from './Icon';
import SyncStatusIcon from './SyncStatusIcon';
import {listDocuments} from '../db/database';
import {
  getSignedInGoogleUser,
  isGoogleDriveSignedIn,
  signInToGoogleDrive,
} from '../services/googleDrive';
import {backupAllDocumentsToDrive} from '../services/driveBackup';
import {
  getOverallSyncState,
  getSyncBlockReason,
  isDocumentSynced,
  setSyncSettings,
  SyncState,
  useSyncSnapshot,
} from '../services/syncStatus';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

function formatLastSynced(timestamp: number | null): string {
  if (!timestamp) {
    return 'Not synced yet';
  }
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) {
    return 'Last synced just now';
  }
  if (minutes < 60) {
    return `Last synced ${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last synced ${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return `Last synced ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Header icon showing overall Google Drive sync status; tapping it opens the
 * sync sheet (progress, last sync time, Auto backup / Wi-Fi only, Sync now).
 */
export default function SyncHeaderButton() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const snap = useSyncSnapshot();
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [busy, setBusy] = useState<'sync' | 'connect' | null>(null);

  const refresh = useCallback(async () => {
    setConnected(isGoogleDriveSignedIn());
    setEmail(getSignedInGoogleUser()?.user.email ?? null);
    try {
      const docs = await listDocuments('all');
      setTotalCount(docs.length);
      setPendingCount(docs.filter(d => !isDocumentSynced(d)).length);
    } catch {
      // keep the previous counts
    }
  }, []);

  // Re-read on focus (covers edits made on other screens) rather than
  // polling the database on a timer.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Counts change when an upload finishes, so re-read then too.
  useEffect(() => {
    refresh();
  }, [snap.lastSyncedAt, snap.syncingIds.length, open, refresh]);

  const state: SyncState = getOverallSyncState(snap, pendingCount);
  const blockReason = getSyncBlockReason(snap);
  const failedCount = Object.keys(snap.failed).length;
  const firstError = Object.values(snap.failed)[0];
  const dotColor =
    state === 'failed'
      ? colors.danger
      : state === 'synced'
      ? colors.success
      : state === 'syncing'
      ? '#FFFFFF'
      : 'rgba(255,255,255,0.55)';

  async function handleConnect() {
    setBusy('connect');
    try {
      await signInToGoogleDrive();
      await refresh();
    } catch {
      Alert.alert('Could not connect', 'Google sign-in failed or was cancelled.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSyncNow() {
    if (busy || state === 'syncing') {
      return;
    }
    if (blockReason === 'offline') {
      Alert.alert('No connection', 'Connect to the internet to sync.');
      return;
    }
    if (blockReason === 'wifi-only') {
      Alert.alert(
        'Wi-Fi only is on',
        'Connect to Wi-Fi, or turn off "Wi-Fi only" to sync over mobile data.',
      );
      return;
    }
    setBusy('sync');
    try {
      const summary = await backupAllDocumentsToDrive();
      if (summary.failed > 0) {
        Alert.alert(
          'Some files failed',
          `${summary.failed} file${summary.failed === 1 ? '' : 's'} could not be uploaded.\n\n${summary.errors[0]?.error ?? ''}`,
        );
      }
    } catch (err) {
      Alert.alert('Sync failed', err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      refresh();
    }
  }

  const percent = snap.progress
    ? Math.round((snap.progress.current / Math.max(1, snap.progress.total)) * 100)
    : state === 'synced'
    ? 100
    : 0;

  let headline: string;
  let detail: string;
  if (state === 'syncing') {
    headline = snap.progress
      ? `Syncing ${snap.progress.current} of ${snap.progress.total} files`
      : 'Syncing…';
    detail = formatLastSynced(snap.lastSyncedAt);
  } else if (state === 'failed') {
    headline = `${failedCount} file${failedCount === 1 ? '' : 's'} failed to sync`;
    detail = firstError ?? 'Tap Retry to try again.';
  } else if (state === 'paused') {
    headline = 'Sync paused';
    detail =
      blockReason === 'offline'
        ? 'No connection. Will resume when you are back online.'
        : 'Wi-Fi only is on. Will resume on Wi-Fi.';
  } else if (state === 'waiting') {
    headline = `${pendingCount} file${pendingCount === 1 ? '' : 's'} waiting to upload`;
    detail = snap.settings.autoBackup
      ? 'Uploading shortly.'
      : 'Auto backup is off. Tap Sync now.';
  } else {
    headline = totalCount === 0 ? 'Nothing to back up yet' : 'All files backed up';
    detail = formatLastSynced(snap.lastSyncedAt);
  }

  const syncing = state === 'syncing' || busy === 'sync';

  return (
    <>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Google Drive sync status">
        <SyncStatusIcon
          state={connected ? state : 'paused'}
          size={22}
          color="#FFFFFF"
        />
        {connected && (
          <View style={[styles.statusDot, {backgroundColor: dotColor}]} />
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, {paddingBottom: 20 + insets.bottom}]}>
          <View style={styles.handle} />

          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Icon
                name="cloud-upload-outline"
                family="community"
                size={26}
                color={colors.accent}
              />
            </View>
            <View style={styles.titleText}>
              <Text style={styles.title}>Google Drive backup</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {connected ? email ?? 'Connected' : 'Not connected'}
              </Text>
            </View>
          </View>

          {connected ? (
            <>
              <View style={styles.statusRow}>
                <Text style={styles.statusHeadline}>{headline}</Text>
                {state === 'syncing' && snap.progress && (
                  <Text style={styles.statusPercent}>{percent}%</Text>
                )}
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${percent}%`,
                      backgroundColor:
                        state === 'failed' ? colors.danger : colors.accent,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.detail, state === 'failed' && {color: colors.danger}]}>
                {detail}
              </Text>

              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Auto backup</Text>
                <Switch
                  value={snap.settings.autoBackup}
                  onValueChange={value => setSyncSettings({autoBackup: value})}
                  trackColor={{true: colors.accent, false: colors.border}}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Wi-Fi only</Text>
                <Switch
                  value={snap.settings.wifiOnly}
                  onValueChange={value => setSyncSettings({wifiOnly: value})}
                  trackColor={{true: colors.accent, false: colors.border}}
                  thumbColor="#FFFFFF"
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  syncing && styles.primaryButtonDisabled,
                ]}
                onPress={handleSyncNow}
                disabled={syncing}
                activeOpacity={0.85}>
                {syncing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="sync" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      {state === 'failed' ? 'Retry' : 'Sync now'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.detail}>
                Connect your Google account to back up every scan to a private
                "Lavati Scanner" folder in your Drive. The app can only see files
                it created itself.
              </Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleConnect}
                disabled={busy === 'connect'}
                activeOpacity={0.85}>
                {busy === 'connect' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="login" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      Connect Google Drive
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    headerButton: {
      width: 40,
      height: 40,
      marginRight: 14,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    statusDot: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: colors.accent,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 16,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 18,
    },
    titleIcon: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentMuted,
    },
    titleText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: colors.textMuted,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    statusHeadline: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    statusPercent: {
      fontSize: 14,
      color: colors.textMuted,
    },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: 4,
    },
    detail: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginTop: 14,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
    },
    toggleLabel: {
      fontSize: 15,
      color: colors.text,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 52,
      marginTop: 20,
      borderRadius: 26,
      backgroundColor: colors.accent,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
