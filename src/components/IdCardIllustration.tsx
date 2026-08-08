import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from './Icon';
import { colors } from '../theme/colors';

type SubMode = 'single' | 'twoSided' | 'passport';

interface Props {
  mode: SubMode;
}

/** Small illustrative mockup of what each ID scan mode captures — no image assets needed. */
export default function IdCardIllustration({ mode }: Props) {
  if (mode === 'passport') {
    return (
      <View style={styles.row}>
        <PassportCard label="Photo page" />
      </View>
    );
  }

  if (mode === 'single') {
    return (
      <View style={styles.row}>
        <MiniCard label="Front" />
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <MiniCard label="Front" />
      <Icon name="arrow-forward" size={18} color="#5A5A5A" />
      <MiniCard label="Back" faded />
    </View>
  );
}

function MiniCard({ label, faded }: { label: string; faded?: boolean }) {
  return (
    <View style={styles.cardWrap}>
      <View style={[styles.card, faded && styles.cardFaded]}>
        <View style={styles.cardTop}>
          <View style={styles.photoCircle} />
          <View style={styles.cardLines}>
            <View style={[styles.line, { width: '80%' }]} />
            <View style={[styles.line, { width: '55%' }]} />
            <View style={[styles.line, { width: '65%' }]} />
          </View>
        </View>
        <View style={[styles.line, { width: '90%', marginTop: 8 }]} />
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function PassportCard({ label }: { label: string }) {
  return (
    <View style={styles.cardWrap}>
      <View style={styles.passport}>
        <View style={styles.passportPhoto} />
        <View style={styles.cardLines}>
          <View style={[styles.line, { width: '85%' }]} />
          <View style={[styles.line, { width: '70%' }]} />
          <View style={[styles.line, { width: '75%' }]} />
          <View style={[styles.line, { width: '60%' }]} />
        </View>
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  cardWrap: {
    alignItems: 'center',
  },
  card: {
    width: 110,
    height: 70,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    padding: 8,
  },
  cardFaded: {
    opacity: 0.55,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  cardLines: {
    flex: 1,
    gap: 4,
  },
  line: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8DEE3',
  },
  cardLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '600',
    color: '#9AA0A6',
  },
  passport: {
    width: 90,
    height: 110,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    padding: 8,
    justifyContent: 'space-between',
  },
  passportPhoto: {
    width: 34,
    height: 44,
    borderRadius: 4,
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.accent,
    alignSelf: 'flex-end',
  },
});
