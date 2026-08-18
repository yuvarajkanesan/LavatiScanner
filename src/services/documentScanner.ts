import {NativeModules} from 'react-native';

const {DocumentScannerModule} = NativeModules;

/**
 * Launches Google's ML Kit Document Scanner (live edge detection +
 * auto-capture + multi-page, native activity) for the "Docs" capture mode.
 * Resolves with the scanned page image URIs in order, or an empty array if
 * the user cancelled — never rejects on cancel, only on a real failure
 * (e.g. Play Services unavailable).
 */
export async function startDocumentScan(): Promise<string[]> {
  const uris: string[] = await DocumentScannerModule.startScan();
  return uris;
}
