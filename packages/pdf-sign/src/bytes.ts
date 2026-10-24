/**
 * node-forge works on "binary strings", one character per byte; PDFs are Uint8Arrays. These move
 * between the two without decoding anything.
 */

export const toBinary = (bytes: Uint8Array): string => {
  let text = "";
  // In chunks: String.fromCharCode takes its arguments on the stack.
  for (let start = 0; start < bytes.length; start += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return text;
};

export const fromBinary = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));

/** Latin-1 text of the bytes, for finding PDF syntax by position. */
export const latin1 = (bytes: Uint8Array): string => new TextDecoder("latin1").decode(bytes);

/** The parts of the file a signature covers: [start, length, start, length] (ISO 32000-1 12.8.1). */
export type ByteRange = [number, number, number, number];

export const signedBytes = (pdf: Uint8Array, [a, b, c, d]: ByteRange): Uint8Array => {
  const out = new Uint8Array(b + d);
  out.set(pdf.subarray(a, a + b), 0);
  out.set(pdf.subarray(c, c + d), b);
  return out;
};
