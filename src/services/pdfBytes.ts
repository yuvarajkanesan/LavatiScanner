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

/** Chunk size for `writeFileBytes`, in raw (pre-base64) bytes. Writing the
 * whole file as one base64 string crashes with an OutOfMemoryError on large
 * PDFs (a multi-page document's PDF can be 50MB+): the JS bridge has to hold
 * that whole string, and native has to Base64-decode it in one allocation on
 * top of that. Writing in ~1.5MB chunks keeps every allocation small,
 * regardless of the total file size. */
const WRITE_CHUNK_BYTES = 1_500_000;

export async function writeFileBytes(outputPath: string, bytes: Uint8Array): Promise<void> {
  if (bytes.length <= WRITE_CHUNK_BYTES) {
    await RNFS.writeFile(outputPath, uint8ArrayToBase64(bytes), 'base64');
    return;
  }
  // First chunk uses writeFile (creates/truncates), the rest append - so a
  // stale file from a previous run never bleeds into the new one.
  await RNFS.writeFile(
    outputPath,
    uint8ArrayToBase64(bytes.subarray(0, WRITE_CHUNK_BYTES)),
    'base64',
  );
  for (let offset = WRITE_CHUNK_BYTES; offset < bytes.length; offset += WRITE_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, offset + WRITE_CHUNK_BYTES);
    await RNFS.appendFile(outputPath, uint8ArrayToBase64(chunk), 'base64');
  }
}
