import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FONT_SCALE_KEY = 'lavati_font_scale';

export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.3;
const DEFAULT_FONT_SCALE = 1;

interface FontScaleContextValue {
  fontScale: number;
  setFontScale: (scale: number) => void;
}

const FontScaleContext = createContext<FontScaleContextValue | undefined>(
  undefined,
);

export function FontScaleProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [fontScale, setFontScaleState] = useState(DEFAULT_FONT_SCALE);

  useEffect(() => {
    AsyncStorage.getItem(FONT_SCALE_KEY).then(saved => {
      const parsed = saved ? parseFloat(saved) : NaN;
      if (!isNaN(parsed) && parsed >= MIN_FONT_SCALE && parsed <= MAX_FONT_SCALE) {
        setFontScaleState(parsed);
      }
    });
  }, []);

  function setFontScale(next: number) {
    const clamped = Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, next));
    setFontScaleState(clamped);
    AsyncStorage.setItem(FONT_SCALE_KEY, String(clamped));
  }

  const value = useMemo<FontScaleContextValue>(
    () => ({ fontScale, setFontScale }),
    [fontScale],
  );

  return (
    <FontScaleContext.Provider value={value}>
      {children}
    </FontScaleContext.Provider>
  );
}

export function useFontScale(): FontScaleContextValue {
  const ctx = useContext(FontScaleContext);
  if (!ctx) {
    throw new Error('useFontScale must be used within a FontScaleProvider');
  }
  return ctx;
}
