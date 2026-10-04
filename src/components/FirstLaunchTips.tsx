import React, {useMemo, useRef, useState} from 'react';
import {
  Dimensions,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon, {IconFamily} from './Icon';
import {AppColors} from '../theme/colors';
import {useTheme} from '../theme/ThemeContext';
import {useResponsive} from '../utils/responsive';

/** Bumping this key (rather than reusing it) is how to make the tips show
 * again for existing installs after a future tour redesign - a plain
 * boolean flag would stay "seen" forever otherwise. */
const TIPS_SEEN_KEY = 'tips_seen_v1';

interface Tip {
  icon: string;
  family?: IconFamily;
  color: string;
  title: string;
  description: string;
}

const TIPS: Tip[] = [
  {
    icon: 'document-scanner',
    color: '#4EA8DE',
    title: 'Scan anything',
    description:
      'Documents, ID cards, books, and QR codes — with automatic edge detection and perspective correction.',
  },
  {
    icon: 'palette',
    family: 'community',
    color: '#9B5DE5',
    title: 'Perfect every scan',
    description:
      'Pick from 7 filters — Magic Color, Lighten, B&W, Warm, Cool, and more — to make every page look its best.',
  },
  {
    icon: 'text-recognition',
    family: 'community',
    color: '#2EC4B6',
    title: 'Searchable text',
    description:
      'On-device text recognition makes every scan searchable and selectable — no cloud processing.',
  },
  {
    icon: 'picture-as-pdf',
    color: '#FF6B6B',
    title: 'Full PDF toolkit',
    description:
      'Merge, edit, sign, watermark, and compress PDFs, right on your device.',
  },
  {
    icon: 'cloud-upload',
    color: '#4EA8DE',
    title: 'Back up to your Drive',
    description:
      'Optional backup to your own Google Drive, restorable anytime. Fully private — nothing passes through us.',
  },
  {
    icon: 'lock',
    color: '#FFA34D',
    title: 'Keep it private',
    description:
      'Lock sensitive folders with a vault PIN or fingerprint/face unlock.',
  },
];

/** Checks (and never throws) whether the first-launch tips have already been
 * shown - callers gate rendering `<FirstLaunchTips>` on this so the modal's
 * own mount/unmount doesn't flash before the async check resolves. */
export async function hasSeenTips(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(TIPS_SEEN_KEY)) === 'true';
  } catch {
    return true;
  }
}

interface Props {
  onDone: () => void;
}

/** Shown once, on first launch - a short swipeable tour of what the app
 * does. Dismissing (Skip or finishing the last page) marks it seen so it
 * never appears again. */
export default function FirstLaunchTips({onDone}: Props) {
  const {colors} = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {contentMaxWidth} = useResponsive();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const cardWidth = Math.min(
    contentMaxWidth,
    Dimensions.get('window').width,
  );

  function finish() {
    AsyncStorage.setItem(TIPS_SEEN_KEY, 'true').catch(() => undefined);
    onDone();
  }

  function goNext() {
    if (index >= TIPS.length - 1) {
      finish();
      return;
    }
    scrollRef.current?.scrollTo({x: cardWidth * (index + 1), animated: true});
    setIndex(index + 1);
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    setIndex(next);
  }

  const isLast = index === TIPS.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.backdrop}>
        <View
          style={[styles.card, {maxWidth: contentMaxWidth, width: '100%'}]}>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={finish}
            hitSlop={8}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            style={{width: cardWidth}}>
            {TIPS.map((tip, i) => (
              <View key={i} style={[styles.page, {width: cardWidth}]}>
                <View
                  style={[
                    styles.iconWrap,
                    {backgroundColor: `${tip.color}26`},
                  ]}>
                  <Icon
                    name={tip.icon}
                    family={tip.family}
                    size={40}
                    color={tip.color}
                  />
                </View>
                <Text style={styles.title}>{tip.title}</Text>
                <Text style={styles.description}>{tip.description}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dotsRow}>
            {TIPS.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === index && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
            <Text style={styles.nextText}>
              {isLast ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>
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
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    card: {
      alignSelf: 'center',
      backgroundColor: colors.background,
      borderRadius: 24,
      paddingTop: 16,
      paddingBottom: 24,
      elevation: 12,
      shadowColor: colors.black,
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.2,
      shadowRadius: 16,
    },
    skipBtn: {
      alignSelf: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 6,
    },
    skipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
    },
    page: {
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 8,
      paddingBottom: 24,
    },
    iconWrap: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 10,
    },
    description: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textMuted,
      textAlign: 'center',
    },
    dotsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
      marginBottom: 20,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.border,
    },
    dotActive: {
      width: 20,
      backgroundColor: colors.accent,
    },
    nextBtn: {
      marginHorizontal: 24,
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    nextText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.white,
    },
  });
