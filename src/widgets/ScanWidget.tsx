import React from 'react';
import {FlexWidget, ImageWidget, SvgWidget, TextWidget} from 'react-native-android-widget';

type ActionKey = 'scan' | 'idcard' | 'import' | 'search';

interface ActionDef {
  key: ActionKey;
  label: string;
  path: string;
  strokeWidth: number;
}

// Same path data as the res/drawable/ic_shortcut_*.xml vectors used by the
// app-icon shortcuts, redrawn as inline SVG strings since SvgWidget can't
// load an Android vector drawable directly.
const ACTIONS: ActionDef[] = [
  {
    key: 'scan',
    label: 'Scan',
    path: 'M4,9 L4,4 L9,4 M15,4 L20,4 L20,9 M20,15 L20,20 L15,20 M9,20 L4,20 L4,15',
    strokeWidth: 2,
  },
  {
    key: 'idcard',
    label: 'ID card',
    path: 'M3,6 L21,6 L21,18 L3,18 Z M6,9 L10,9 L10,13 L6,13 Z M13,9 L19,9 M13,12 L19,12 M13,15 L17,15',
    strokeWidth: 1.6,
  },
  {
    key: 'import',
    label: 'Import',
    path: 'M12,3 L12,14 M8,10 L12,14 L16,10 M4,18 L20,18 L20,21 L4,21 Z',
    strokeWidth: 1.8,
  },
  {
    key: 'search',
    label: 'Search',
    path: 'M10,3 a6,6 0 1 0 0.01,0 Z M15,15 L20,20',
    strokeWidth: 1.8,
  },
];

function svg(path: string, strokeWidth: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" /></svg>`;
}

type HexColor = `#${string}`;

interface Palette {
  card: HexColor;
  title: HexColor;
  label: HexColor;
  primaryBg: HexColor;
  primaryIcon: HexColor;
  secondaryBg: HexColor;
  secondaryIcon: HexColor;
}

// Mirrors src/theme/colors.ts lightColors/darkColors - kept as plain hex
// here since widget components render natively (RemoteViews), outside the
// app's React tree, and can't reach ThemeContext.
const LIGHT: Palette = {
  card: '#FFFFFF',
  title: '#1A2333',
  label: '#1A2333',
  primaryBg: '#2F6FED',
  primaryIcon: '#FFFFFF',
  secondaryBg: '#E3ECFC',
  secondaryIcon: '#2F6FED',
};

const DARK: Palette = {
  card: '#141E33',
  title: '#F2F5FC',
  label: '#F2F5FC',
  primaryBg: '#3D7CFF',
  primaryIcon: '#FFFFFF',
  secondaryBg: '#1B2A47',
  secondaryIcon: '#6E9BFF',
};

function ActionButton({
  action,
  primary,
  palette,
}: {
  action: ActionDef;
  primary: boolean;
  palette: Palette;
}) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{uri: `lavatiscanner://${action.key}`}}
      style={{
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
      }}>
      <FlexWidget
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: primary ? palette.primaryBg : palette.secondaryBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <SvgWidget
          svg={svg(action.path, action.strokeWidth, primary ? palette.primaryIcon : palette.secondaryIcon)}
          style={{width: 22, height: 22}}
        />
      </FlexWidget>
      <TextWidget
        text={action.label}
        style={{fontSize: 11, color: palette.label, marginTop: 4, textAlign: 'center'}}
        maxLines={1}
      />
    </FlexWidget>
  );
}

/**
 * "One-Tap Scan" widget - logo header + Scan as the filled primary button
 * alongside three secondary shortcuts, labels centered under each icon.
 * Rendered twice (light/dark) and handed to the native side as a pair so
 * Android switches between them with the system theme with no JS redraw.
 */
function ScanWidgetBody({palette}: {palette: Palette}) {
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        backgroundColor: palette.card,
        borderRadius: 20,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
      <FlexWidget
        clickAction="OPEN_APP"
        style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
        <ImageWidget
          image={require('../assets/app-icon.png')}
          imageWidth={28}
          imageHeight={28}
          radius={8}
        />
        <TextWidget
          text="Lavati Scanner"
          style={{fontSize: 14, fontWeight: '700', color: palette.title, marginLeft: 8}}
          maxLines={1}
        />
      </FlexWidget>
      <FlexWidget style={{flexDirection: 'row'}}>
        {ACTIONS.map((action, index) => (
          <ActionButton key={action.key} action={action} primary={index === 0} palette={palette} />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

export function ScanWidgetLight() {
  return <ScanWidgetBody palette={LIGHT} />;
}

export function ScanWidgetDark() {
  return <ScanWidgetBody palette={DARK} />;
}
