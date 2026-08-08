export type IdCardSubMode = 'single' | 'twoSided' | 'passport';

export interface IdCardSubModeOption {
  key: IdCardSubMode;
  label: string;
  icon: string;
  docPrefix: string;
  description: string;
}

/** Shared between IdCardScanScreen (its own sub-mode picker) and
 * CaptureScreen (the same picker shown as a pre-capture intro overlay). */
export const ID_CARD_SUB_MODES: IdCardSubModeOption[] = [
  {
    key: 'single',
    label: 'Single Side',
    icon: 'credit-card',
    docPrefix: 'Card',
    description: 'One quick shot of a single-sided card.',
  },
  {
    key: 'twoSided',
    label: 'Driver Licence',
    icon: 'badge',
    docPrefix: 'ID',
    description: 'Capture front, then back — combined into one 2-sided e-copy.',
  },
  {
    key: 'passport',
    label: 'Passport',
    icon: 'menu-book',
    docPrefix: 'Passport',
    description: 'One shot of the passport photo page.',
  },
];
