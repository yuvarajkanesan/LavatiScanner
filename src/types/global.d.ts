import { Buffer as NodeBuffer } from 'buffer';

declare global {
  // eslint-disable-next-line no-var
  var Buffer: typeof NodeBuffer;
}

export {};
