import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  StyleProp,
  View,
} from 'react-native';
import {FilterType} from '../types/models';
import {renderFilterPreview} from '../services/nativeImageFilter';

interface Props {
  uri: string;
  filter: FilterType;
  style?: StyleProp<ImageStyle>;
}

/**
 * Renders a filtered preview via the native Bitmap/Canvas bake (see
 * services/nativeImageFilter) instead of a GPU ColorMatrix view - some
 * devices render react-native-color-matrix-image-filters' hardware-layer
 * view as solid black, so filtered previews go through the same
 * always-correct native path as the final saved page.
 */
export default function FilteredImage({uri, filter, style}: Props) {
  const [displayUri, setDisplayUri] = useState<string | null>(
    filter === 'original' ? uri : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (filter === 'original') {
      setDisplayUri(uri);
      return;
    }
    setDisplayUri(null);
    renderFilterPreview(uri, filter)
      .then(result => {
        if (!cancelled) {
          setDisplayUri(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisplayUri(uri);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [uri, filter]);

  if (!displayUri) {
    return (
      <View style={[style, styles.loading]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Image source={{uri: displayUri}} style={style} resizeMode="contain" />
  );
}

const styles = {
  loading: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
};
