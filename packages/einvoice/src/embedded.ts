import {
  decodePDFRawStream,
  PDFArray,
  type PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFObject,
  PDFRawStream,
  PDFString,
} from "pdf-lib";

/*
 * Taken from Haben (github.com/firsttris/haben, packages/einvoice/src/embedded.ts, AGPL-3.0-only,
 * the same author), without Node: pdf-lib decodes the stream instead of node:zlib.
 */

/** The names the invoice XML has in hybrid PDFs, in this order of preference. */
const KNOWN_NAMES = ["factur-x.xml", "zugferd-invoice.xml", "xrechnung.xml"];

/** The largest attachment unpacked: a small PDF must not unpack gigabytes (a deflate bomb). */
export const MAX_EMBEDDED_BYTES = 32 * 1024 * 1024;

type Attachment = { filename: string; spec: PDFDict };

/** The invoice XML a PDF carries (ZUGFeRD 1 and 2, Factur-X, an XRechnung attached), or null. */
export const extractEmbeddedXml = async (
  pdf: Uint8Array,
): Promise<{ filename: string; xml: string } | null> => {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(pdf, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch {
    return null;
  }
  const attachments = collectAttachments(document);
  const ranked = [
    ...KNOWN_NAMES.flatMap((name) => attachments.filter((a) => a.filename.toLowerCase() === name)),
    ...attachments.filter(
      (a) => a.filename.toLowerCase().endsWith(".xml") || isXmlSubtype(a.spec, document.context),
    ),
  ];
  for (const attachment of ranked) {
    const bytes = embeddedBytes(attachment.spec, document.context);
    if (!bytes) continue;
    const xml = decodeXmlBytes(bytes);
    if (xml.trimStart().startsWith("<")) return { filename: attachment.filename, xml };
  }
  return null;
};

/** The file specifications: the EmbeddedFiles name tree, the catalog's /AF (PDF/A-3), else any. */
const collectAttachments = (document: PDFDocument): Attachment[] => {
  const { context, catalog } = document;
  const specs: PDFDict[] = [];
  const add = (object: PDFObject | undefined) => {
    const spec = object && context.lookup(object);
    if (spec instanceof PDFDict && !specs.includes(spec)) specs.push(spec);
  };

  const names = catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const tree = names?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const seen = new Set<PDFDict>();
  const walk = (node: PDFDict | undefined) => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const pairs = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (pairs) for (let i = 1; i < pairs.size(); i += 2) add(pairs.get(i));
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookupMaybe(i, PDFDict));
  };
  walk(tree);

  const af = catalog.lookupMaybe(PDFName.of("AF"), PDFArray);
  if (af) for (let i = 0; i < af.size(); i++) add(af.get(i));

  if (specs.length === 0) {
    for (const [, object] of context.enumerateIndirectObjects()) {
      if (object instanceof PDFDict && object.has(PDFName.of("EF"))) add(object);
    }
  }
  return specs.map((spec) => ({ spec, filename: specName(spec) }));
};

const specName = (spec: PDFDict): string => {
  for (const key of ["UF", "F"]) {
    const value = spec.lookup(PDFName.of(key));
    if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText().trim();
  }
  return "";
};

const embeddedFile = (spec: PDFDict, context: PDFContext): PDFRawStream | undefined => {
  const ef = spec.lookupMaybe(PDFName.of("EF"), PDFDict);
  for (const key of ["F", "UF"]) {
    const ref = ef?.get(PDFName.of(key));
    const stream = ref && context.lookup(ref);
    if (stream instanceof PDFRawStream) return stream;
  }
  return undefined;
};

const isXmlSubtype = (spec: PDFDict, context: PDFContext): boolean => {
  const subtype = embeddedFile(spec, context)?.dict.lookup(PDFName.of("Subtype"));
  return subtype instanceof PDFName && /xml/i.test(subtype.decodeText());
};

/** The attachment's bytes, unpacked in pieces up to MAX_EMBEDDED_BYTES; null past that or broken. */
const embeddedBytes = (spec: PDFDict, context: PDFContext): Uint8Array | null => {
  const stream = embeddedFile(spec, context);
  if (!stream) return null;
  if (!stream.dict.has(PDFName.of("Filter"))) return stream.contents;
  try {
    const decoded = decodePDFRawStream(stream);
    // pdf-lib types a chunk as Uint8Array or Uint8ClampedArray; both are bytes.
    const chunks: Array<Uint8Array | Uint8ClampedArray> = [];
    let total = 0;
    for (let chunk = decoded.getBytes(65_536); chunk.length > 0; chunk = decoded.getBytes(65_536)) {
      total += chunk.length;
      if (total > MAX_EMBEDDED_BYTES) return null;
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } catch {
    return null;
  }
};

/** UTF-8 (with or without BOM), UTF-16 with BOM, or what the XML declaration names (ISO-8859-1). */
export const decodeXmlBytes = (bytes: Uint8Array): string => {
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const encoding = /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  if (encoding && encoding !== "utf-8" && encoding !== "utf8") {
    try {
      return new TextDecoder(encoding).decode(bytes);
    } catch {
      // An encoding the browser does not know: try UTF-8.
    }
  }
  return new TextDecoder("utf-8").decode(bytes);
};
