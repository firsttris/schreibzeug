import { zlibSync } from "fflate";

/** CRC-32 as PNG chunks carry it (ISO 3309, the PNG specification's sample code). */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Uint8Array): number =>
  (bytes.reduce((crc, byte) => (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8), 0xffffffff) ^
    0xffffffff) >>>
  0;

const uint32 = (value: number) => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const chunk = (type: string, data: Uint8Array): number[] => {
  const typed = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  return [...uint32(data.length), ...typed, ...uint32(crc32(typed))];
};

/** A PNG of one colour, made here so the test needs no image file. */
export const solidPng = (width: number, height: number, [r, g, b]: [number, number, number]): Uint8Array => {
  const header = new Uint8Array([...uint32(width), ...uint32(height), 8, 2, 0, 0, 0]);
  const row = [0, ...Array.from({ length: width }, () => [r, g, b]).flat()];
  const pixels = new Uint8Array(Array.from({ length: height }, () => row).flat());
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", header),
    ...chunk("IDAT", zlibSync(pixels)),
    ...chunk("IEND", new Uint8Array()),
  ]);
};
