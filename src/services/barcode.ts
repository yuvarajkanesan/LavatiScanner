import BarcodeScanning, { Barcode } from '@react-native-ml-kit/barcode-scanning';

export async function scanBarcodesFromImage(filePath: string): Promise<Barcode[]> {
  const uri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
  return BarcodeScanning.scan(uri);
}
