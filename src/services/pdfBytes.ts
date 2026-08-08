import RNFS from 'react-native-fs';

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = global.Buffer.from(base64, 'base64');
  return new Uint8Array(binary);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  return global.Buffer.from(bytes).toString('base64');
}

export async function readFileBytes(filePath: string): Promise<Uint8Array> {
  const cleanPath = filePath.replace('file://', '');
  const base64 = await RNFS.readFile(cleanPath, 'base64');
  return base64ToUint8Array(base64);
}

export async function writeFileBytes(outputPath: string, bytes: Uint8Array): Promise<void> {
  await RNFS.writeFile(outputPath, uint8ArrayToBase64(bytes), 'base64');
}
