import React, {useCallback, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Share from 'react-native-share';
import RNFS from 'react-native-fs';
import {useFocusEffect} from '@react-navigation/native';
import {listDocuments, listPages} from '../db/database';
import {DocumentSummary} from '../types/models';
import {compressImage} from '../services/nativeImageFilter';
import {buildPdfFromImages} from '../services/pdfExport';
import {scanTimestampName, formatBytes} from '../utils/format';
import {generateId} from '../utils/ids';
import Icon from '../components/Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';

interface QualityOption {
  key: string;
  label: string;
  quality: number;
  hint: string;
}

const QUALITY_OPTIONS: QualityOption[] = [
  {key: 'low', label: 'Smaller File', quality: 40, hint: 'Most compression'},
  {key: 'medium', label: 'Balanced', quality: 65, hint: 'Recommended'},
  {key: 'high', label: 'Best Quality', quality: 85, hint: 'Least compression'},
];

type Status = 'idle' | 'working' | 'done' | 'error';

export default function CompressionScreen() {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentSummary | null>(null);
  const [qualityKey, setQualityKey] = useState('medium');
  const [status, setStatus] = useState<Status>('idle');
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<number>(0);

  const load = useCallback(async () => {
    setDocuments(await listDocuments('all'));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function selectDocument(doc: DocumentSummary) {
    setSelectedDoc(doc);
    setStatus('idle');
    setResultPath(null);
  }

  async function handleCompress() {
    if (!selectedDoc) {
      return;
    }
    const quality = QUALITY_OPTIONS.find(q => q.key === qualityKey)!.quality;
    try {
      setStatus('working');
      const pages = await listPages(selectedDoc.id);
      const compressedPaths: string[] = [];
      for (const page of pages) {
        const outputPath = `${
          RNFS.CachesDirectoryPath
        }/compressed_${generateId()}.jpg`;
        await compressImage(page.filePath, outputPath, quality);
        compressedPaths.push(outputPath);
      }
      const pdfPath = await buildPdfFromImages(
        compressedPaths,
        `${selectedDoc.name}_compressed_${scanTimestampName()}`,
      );
      const stat = await RNFS.stat(pdfPath);
      setResultPath(pdfPath);
      setResultSize(stat.size);
      setStatus('done');
    } catch (error) {
      setStatus('error');
    }
  }

  async function handleShare() {
    if (!resultPath) {
      return;
    }
    await Share.open({
      url: `file://${resultPath}`,
      type: 'application/pdf',
      failOnCancel: false,
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Pick a document, choose a quality level, and compress it to a smaller
        PDF.
      </Text>

      <FlatList
        data={documents}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({item}) => {
          const isSelected = selectedDoc?.id === item.id;
          return (
            <TouchableOpacity
              style={[styles.row, isSelected && styles.rowSelected]}
              onPress={() => selectDocument(item)}
              activeOpacity={0.7}>
              {item.thumbnailPath ? (
                <Image
                  source={{uri: `file://${item.thumbnailPath}`}}
                  style={styles.thumb}
                />
              ) : (
                <View style={styles.thumb} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSubtitle}>{item.pageCount} pages</Text>
              </View>
              {isSelected && (
                <Icon name="check-circle" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>
          );
        }}
      />

      {selectedDoc && (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Quality</Text>
          <View style={styles.qualityRow}>
            {QUALITY_OPTIONS.map(option => {
              const active = option.key === qualityKey;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.qualityChip,
                    active && styles.qualityChipActive,
                  ]}
                  onPress={() => setQualityKey(option.key)}>
                  <Text
                    style={[
                      styles.qualityChipLabel,
                      active && styles.qualityChipLabelActive,
                    ]}>
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.qualityChipHint,
                      active && styles.qualityChipLabelActive,
                    ]}>
                    {option.hint}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {status === 'done' && resultPath && (
            <Text style={styles.resultText}>
              Compressed size: {formatBytes(resultSize)}
            </Text>
          )}
          {status === 'error' && (
            <Text style={styles.errorText}>
              Could not compress this document.
            </Text>
          )}

          {status === 'done' ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Icon
                name="share-variant"
                family="community"
                size={18}
                color={colors.white}
              />
              <Text style={styles.actionButtonText}>Share Compressed PDF</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCompress}
              disabled={status === 'working'}>
              {status === 'working' ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Icon
                    name="zip-box-outline"
                    family="community"
                    size={18}
                    color={colors.white}
                  />
                  <Text style={styles.actionButtonText}>Compress</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
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
    hint: {
      padding: 16,
      paddingBottom: 8,
      fontSize: 13,
      color: colors.textMuted,
    },
    list: {
      padding: 16,
      paddingTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 10,
      marginBottom: 10,
      gap: 12,
    },
    rowSelected: {
      borderColor: colors.accent,
    },
    thumb: {
      width: 40,
      height: 52,
      borderRadius: 5,
      backgroundColor: colors.border,
    },
    rowText: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    rowSubtitle: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textMuted,
    },
    panel: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.background,
    },
    panelLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    qualityRow: {
      flexDirection: 'row',
      gap: 8,
    },
    qualityChip: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingVertical: 10,
      alignItems: 'center',
    },
    qualityChipActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentMuted,
    },
    qualityChipLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    qualityChipHint: {
      marginTop: 2,
      fontSize: 10,
      color: colors.textMuted,
    },
    qualityChipLabelActive: {
      color: colors.accent,
    },
    resultText: {
      marginTop: 14,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    errorText: {
      marginTop: 14,
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      height: 48,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    actionButtonText: {
      color: colors.white,
      fontWeight: '700',
      fontSize: 14,
    },
  });
