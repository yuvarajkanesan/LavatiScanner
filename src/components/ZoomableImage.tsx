import React, {useRef, useState} from 'react';
import {
  Image,
  ImageResizeMode,
  ImageStyle,
  LayoutChangeEvent,
  PanResponder,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

interface Props {
  /** Either supply `uri` to let this component render its own <Image>, or
   * supply `children` (e.g. a component that renders its own <Image>
   * asynchronously, like FilteredImage) to have the pinch/pan transform
   * apply to that instead. */
  uri?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  resizeMode?: ImageResizeMode;
  minScale?: number;
  maxScale?: number;
}

const DOUBLE_TAP_MS = 300;
const TAP_SLOP = 8;

/**
 * Two-finger pinch to zoom + drag-to-pan-when-zoomed + double-tap to
 * toggle zoom, implemented on plain PanResponder rather than a gesture
 * library — RN's ScrollView zoom props (`minimumZoomScale` etc.) are
 * iOS-only, so they don't work on this Android-only app.
 */
export default function ZoomableImage({
  uri,
  children,
  style,
  resizeMode = 'contain',
  minScale = 1,
  maxScale = 4,
}: Props) {
  const [scale, setScale] = useState(minScale);
  const [translate, setTranslate] = useState({x: 0, y: 0});

  const scaleRef = useRef(minScale);
  const translateRef = useRef({x: 0, y: 0});
  const containerRef = useRef({width: 0, height: 0});
  const pinchStartDistance = useRef<number | null>(null);
  const pinchStartScale = useRef(minScale);
  const panStart = useRef({x: 0, y: 0});
  const lastTap = useRef(0);

  function updateScale(v: number) {
    scaleRef.current = v;
    setScale(v);
  }

  function updateTranslate(v: {x: number; y: number}) {
    translateRef.current = v;
    setTranslate(v);
  }

  function clampTranslate(t: {x: number; y: number}, s: number) {
    const {width, height} = containerRef.current;
    const maxX = Math.max(0, (width * (s - 1)) / 2);
    const maxY = Math.max(0, (height * (s - 1)) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, t.x)),
      y: Math.min(maxY, Math.max(-maxY, t.y)),
    };
  }

  function touchDistance(touches: {pageX: number; pageY: number}[]) {
    const [a, b] = touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const touches = evt.nativeEvent.touches;
        pinchStartDistance.current =
          touches.length === 2 ? touchDistance(touches) : null;
        pinchStartScale.current = scaleRef.current;
        panStart.current = translateRef.current;
      },
      onPanResponderMove: (evt, gesture) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          if (pinchStartDistance.current === null) {
            pinchStartDistance.current = touchDistance(touches);
            pinchStartScale.current = scaleRef.current;
            return;
          }
          const dist = touchDistance(touches);
          const nextScale = Math.min(
            maxScale,
            Math.max(
              minScale,
              pinchStartScale.current * (dist / pinchStartDistance.current),
            ),
          );
          updateScale(nextScale);
          updateTranslate(clampTranslate(translateRef.current, nextScale));
        } else if (touches.length === 1 && scaleRef.current > minScale) {
          updateTranslate(
            clampTranslate(
              {
                x: panStart.current.x + gesture.dx,
                y: panStart.current.y + gesture.dy,
              },
              scaleRef.current,
            ),
          );
        }
      },
      onPanResponderRelease: (evt, gesture) => {
        pinchStartDistance.current = null;
        const wasTap =
          Math.abs(gesture.dx) < TAP_SLOP &&
          Math.abs(gesture.dy) < TAP_SLOP &&
          evt.nativeEvent.changedTouches.length === 1;
        if (wasTap) {
          const now = Date.now();
          if (now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            if (scaleRef.current > minScale) {
              updateScale(minScale);
              updateTranslate({x: 0, y: 0});
            } else {
              updateScale(minScale + (maxScale - minScale) / 2);
            }
          } else {
            lastTap.current = now;
          }
        }
        if (scaleRef.current <= minScale) {
          updateScale(minScale);
          updateTranslate({x: 0, y: 0});
        }
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  function handleLayout(e: LayoutChangeEvent) {
    containerRef.current = {
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    };
  }

  const transformStyle = {
    transform: [{translateX: translate.x}, {translateY: translate.y}, {scale}],
  };

  return (
    <View
      style={[styles.wrap, style]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}>
      {children ? (
        <View style={[StyleSheet.absoluteFill, transformStyle]}>
          {children}
        </View>
      ) : (
        <Image
          source={{uri}}
          resizeMode={resizeMode}
          style={
            [StyleSheet.absoluteFill, transformStyle] as StyleProp<ImageStyle>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});
