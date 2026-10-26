import { Inflate, strFromU8, type Unzipped } from "fflate";

/**
 * How much an Office package may hold once inflated, all entries together. A .docx, .xlsx or
 * .pptx of real work stays far below; a zip bomb of a few kilobytes would claim gigabytes and
 * block the server's single thread while it inflates.
 */
export const MAX_UNZIPPED_BYTES = 128 * 1024 * 1024;

const TOO_LARGE = "ArchiveTooLarge";

/** Whether `error` is the refusal of `boundedUnzip`, so a caller can say "too large" instead of "broken". */
export const isArchiveTooLarge = (error: unknown): boolean =>
  error instanceof Error && error.name === TOO_LARGE;

const tooLarge = (): Error =>
  Object.assign(new Error(`The archive holds more than ${MAX_UNZIPPED_BYTES} bytes.`), { name: TOO_LARGE });

const corrupt = (what: string): Error => new Error(`Not a readable zip archive: ${what}.`);

/** Compressed bytes handed to the inflater at once: bounds what one step can inflate (deflate: ≤1032:1). */
const CHUNK = 16 * 1024;

type Entry = { name: string; compression: number; size: number; originalSize: number; localOffset: number };

const reader = (data: Uint8Array) => {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  /** The offset, once it is clear that `length` bytes from it lie inside the archive. */
  const inside = (offset: number, length: number): number => {
    if (offset < 0 || offset + length > data.length) throw corrupt("a record lies outside the file");
    return offset;
  };
  return {
    u16: (offset: number) => view.getUint16(inside(offset, 2), true),
    u32: (offset: number) => view.getUint32(inside(offset, 4), true),
    u64: (offset: number) => Number(view.getBigUint64(inside(offset, 8), true)),
    bytes: (offset: number, length: number) => data.subarray(inside(offset, length), offset + length),
  };
};
type Reader = ReturnType<typeof reader>;

/** Where the central directory starts and how many entries it has (APPNOTE 4.3.16, 4.3.14 for Zip64). */
const directoryOf = (data: Uint8Array, read: Reader): { count: number; offset: number } => {
  let end = data.length - 22;
  while (end >= 0 && read.u32(end) !== 0x06054b50) {
    if (data.length - end > 65_557) break;
    end -= 1;
  }
  if (end < 0 || read.u32(end) !== 0x06054b50) throw corrupt("no end of central directory");
  const locator = end - 20;
  if (locator >= 0 && read.u32(locator) === 0x07064b50) {
    const zip64End = read.u64(locator + 8);
    if (read.u32(zip64End) === 0x06064b50)
      return { count: read.u64(zip64End + 32), offset: read.u64(zip64End + 48) };
  }
  return { count: read.u16(end + 10), offset: read.u32(end + 16) };
};

/** The sizes and offset a Zip64 extra field holds for the fields saturated at 0xFFFFFFFF (4.5.3). */
const zip64Values = (read: Reader, extra: number, extraLength: number, saturated: boolean[]): number[] => {
  for (let at = extra; at + 4 <= extra + extraLength; at += 4 + read.u16(at + 2)) {
    if (read.u16(at) !== 0x0001) continue;
    let field = at + 4;
    return saturated.map((wanted) => {
      if (!wanted) return -1;
      const value = read.u64(field);
      field += 8;
      return value;
    });
  }
  return saturated.map(() => -1);
};

/** One central directory header (4.3.12) and where the next begins. */
const entryAt = (read: Reader, at: number): { entry: Entry; next: number } => {
  if (read.u32(at) !== 0x02014b50) throw corrupt("a broken central directory");
  const flags = read.u16(at + 8);
  const nameLength = read.u16(at + 28);
  const extraLength = read.u16(at + 30);
  const commentLength = read.u16(at + 32);
  const fields = [read.u32(at + 24), read.u32(at + 20), read.u32(at + 42)];
  const wide = zip64Values(
    read,
    at + 46 + nameLength,
    extraLength,
    fields.map((value) => value === 0xffffffff),
  );
  const [originalSize = 0, size = 0, localOffset = 0] = fields.map((value, index) =>
    value === 0xffffffff ? (wide[index] ?? -1) : value,
  );
  if (originalSize < 0 || size < 0 || localOffset < 0) throw corrupt("a Zip64 entry without its sizes");
  return {
    entry: {
      // Bit 11: UTF-8 names; otherwise code page 437, read as Latin-1 like fflate's unzipSync.
      name: strFromU8(read.bytes(at + 46, nameLength), (flags & 0x800) === 0),
      compression: read.u16(at + 10),
      size,
      originalSize,
      localOffset,
    },
    next: at + 46 + nameLength + extraLength + commentLength,
  };
};

/** The compressed bytes of an entry, behind its local header (4.3.7). */
const compressedOf = (read: Reader, entry: Entry): Uint8Array => {
  if (read.u32(entry.localOffset) !== 0x04034b50) throw corrupt("a broken local header");
  const start = entry.localOffset + 30 + read.u16(entry.localOffset + 26) + read.u16(entry.localOffset + 28);
  return read.bytes(start, entry.size);
};

/**
 * Inflates one entry, counting what comes out: the declared size is the attacker's word, so the
 * stream stops as soon as it gives more than it declared. With the declared sizes within the
 * budget, so is what is actually inflated.
 */
const inflateCounted = (compressed: Uint8Array, entry: Entry): Uint8Array<ArrayBuffer> => {
  if (entry.compression === 0) {
    if (compressed.length > entry.originalSize) throw corrupt("an entry longer than declared");
    return new Uint8Array(compressed);
  }
  if (entry.compression !== 8) throw corrupt(`compression method ${entry.compression}`);
  const out = new Uint8Array(entry.originalSize);
  let length = 0;
  let done = false;
  const inflater = new Inflate((chunk, final) => {
    if (length + chunk.length > entry.originalSize) throw corrupt("an entry longer than declared");
    out.set(chunk, length);
    length += chunk.length;
    done ||= final;
  });
  for (let at = 0; at < compressed.length; at += CHUNK) {
    inflater.push(compressed.subarray(at, at + CHUNK), at + CHUNK >= compressed.length);
  }
  if (compressed.length === 0) inflater.push(new Uint8Array(0), true);
  if (!done) throw corrupt("an unfinished entry");
  return length === out.length ? out : out.slice(0, length);
};

/**
 * `unzipSync` with a budget: the entries `keep` accepts, inflated only when their declared sizes
 * fit into MAX_UNZIPPED_BYTES together, and each stopped as soon as it inflates past what it
 * declared. Throws like `unzipSync` on a broken archive; `isArchiveTooLarge` tells the budget apart.
 */
export const boundedUnzip = (data: Uint8Array, keep: (name: string) => boolean = () => true): Unzipped => {
  const read = reader(data);
  const directory = directoryOf(data, read);
  const entries: Entry[] = [];
  let at = directory.offset;
  let declared = 0;
  for (let index = 0; index < directory.count; index += 1) {
    const { entry, next } = entryAt(read, at);
    at = next;
    if (!keep(entry.name)) continue;
    declared += entry.originalSize;
    if (declared > MAX_UNZIPPED_BYTES) throw tooLarge();
    entries.push(entry);
  }
  const files: Unzipped = {};
  for (const entry of entries) {
    files[entry.name] = inflateCounted(compressedOf(read, entry), entry);
  }
  return files;
};
