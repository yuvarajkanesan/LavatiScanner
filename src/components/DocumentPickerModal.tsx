import React, {useEffect, useMemo, useState} from 'react';
import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {listDocuments} from '../db/database';
import {DocumentSummary} from '../types/models';
import Icon from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {useResponsive} from '../utils/responsive';

interface Props {
  visible: boolean;
  title: string;
  onClose: () => void;
  onPick: (doc: DocumentSummary) => void;
}

/** Simple "choose one of your documents" list - used by Tools entries that
 * act on a single document (currently just Export to Word) but, unlike
 * DocumentDetailScreen's per-document actions, aren't launched from a
 * document already in context. */
export default function DocumentPickerModal({visible, title, onClose, onPick}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {contentMaxWidth} = useResponsive();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) {
      setQuery('');
      listDocuments('all').then(setDocuments);
    }
  }, [visible]);

  const filtered = query.trim()
    ? documents.filter(d =>
        d.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : documents;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {maxWidth: contentMaxWidth, width: '100%', alignSelf: 'center'},
          ]}>
          <View style={styles.dragHandle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Icon name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Icon name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search documents"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>
              {documents.length === 0 ? 'No documents yet.' : 'No matches.'}
            </Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={item => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({item}) => (
                <TouchableOpacity style={styles.row} onPress={() => onPick(item)}>
                  <View style={styles.rowThumbWrap}>
                    {item.thumbnailPath ? (
                      <Image
                        source={{uri: `file://${item.thumbnailPath}`}}
                        style={styles.rowThumb}
                        resizeMode="cover"
                      />
                    ) : (
                      <Icon name="description" size={18} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {item.pageCount} page{item.pageCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      maxHeight: '80%',
      paddingBottom: 20,
      elevation: 12,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: -2},
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    dragHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: 10,
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      padding: 0,
    },
    emptyText: {
      textAlign: 'center',
      fontSize: 14,
      color: colors.textMuted,
      paddingVertical: 32,
    },
    list: {
      flexGrow: 0,
      marginTop: 6,
    },
    listContent: {
      paddingBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 12,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    rowThumbWrap: {
      width: 40,
      height: 52,
      borderRadius: 6,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    rowThumb: {
      width: '100%',
      height: '100%',
    },
    rowInfo: {
      flex: 1,
    },
    rowLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    rowMeta: {
      marginTop: 2,
      fontSize: 12,
      color: colors.textMuted,
    },
  });
