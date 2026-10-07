import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {FilterType} from '../types/models';
import {renderFilterPreview} from '../services/nativeImageFilter';

interface Props {
  uri: string;
  filter: FilterType;
  style?: StyleProp<ViewStyle>;
}

const SWEEP_DURATION = 800;
const LINE_COLOR = '#1E9BFF';

/**
 * Same filtered-preview bake as FilteredImage, but reveals a new filter by
 * sweeping a blue line down over the previous result instead of popping
 * straight to the new bitmap - used for the one large "after crop" preview
 * on FilterScreen where the transition reads as a deliberate action, not
 * the small filmstrip thumbnails where it would just be visual noise.
 */
export default function FilterRevealImage({uri, filter, style}: Props) {
  const [containerHeight, setContainerHeight] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [baseUri, setBaseUri] = useState<string>(uri);
  const [targetUri, setTargetUri] = useState<string | null>(
    filter === 'original' ? uri : null,
  );
  const progress = useRef(new Animated.Value(0)).current;
  const lastUriRef = useRef(uri);
  const animatedTargetRef = useRef<string | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => setAnimate(!reduced));
  }, []);

  // A different page (not just a different filter on the same page) snaps
  // immediately - sweeping in stale content from another page would be
  // misleading, not a useful transition.
  useEffect(() => {
    if (uri !== lastUriRef.current) {
      lastUriRef.current = uri;
      animatedTargetRef.current = null;
      progress.stopAnimation();
      progress.setValue(0);
      setBaseUri(uri);
      setTargetUri(filter === 'original' ? uri : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  useEffect(() => {
    let cancelled = false;
    if (filter === 'original') {
      setTargetUri(uri);
      return undefined;
    }
    renderFilterPreview(uri, filter)
      .then(result => {
        if (!cancelled) setTargetUri(result);
      })
      .catch(() => {
        if (!cancelled) setTargetUri(uri);
      });
    return () => {
      cancelled = true;
    };
  }, [uri, filter]);

  useEffect(() => {
    if (!targetUri || containerHeight === 0) return;
    if (targetUri === animatedTargetRef.current) return;
    animatedTargetRef.current = targetUri;

    if (!animate) {
      progress.setValue(containerHeight);
      setBaseUri(targetUri);
      return;
    }

    progress.stopAnimation(() => {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: containerHeight,
        duration: SWEEP_DURATION,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({finished}) => {
        if (finished) setBaseUri(targetUri);
      });
    });
  }, [targetUri, containerHeight, animate, progress]);

  function handleLayout(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    if (h !== containerHeight) setContainerHeight(h);
  }

  const showSweep = animate && targetUri && targetUri !== baseUri && containerHeight > 0;

  return (
    <Animated.View style={style} onLayout={handleLayout}>
      <Image source={{uri: baseUri}} style={StyleSheet.absoluteFill} resizeMode="contain" />
      {showSweep && (
        <Animated.View
          pointerEvents="none"
          style={[styles.reveal, {height: progress}]}>
          <Image
            source={{uri: targetUri!}}
            style={[styles.revealImage, {height: containerHeight}]}
            resizeMode="contain"
          />
          <Animated.View style={styles.band}>
            <LinearGradient
              colors={['rgba(30,155,255,0)', 'rgba(30,155,255,0.55)']}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.line,
              {
                opacity: progress.interpolate({
                  inputRange: [
                    0,
                    Math.max(1, containerHeight * 0.03),
                    Math.max(2, containerHeight * 0.95),
                    containerHeight,
                  ],
                  outputRange: [0, 1, 1, 0],
                }),
              },
            ]}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  reveal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    overflow: 'hidden',
  },
  revealImage: {
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '26%',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: LINE_COLOR,
  },
});
